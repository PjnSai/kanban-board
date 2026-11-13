from datetime import timedelta

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from .models import Board, BoardMembership, Invitation, UserBlock
from .views import broadcast_board_event
from .roles import get_role
from .notifications import notify

MAX_MEMBERS_PER_BOARD = 9
MAX_PENDING_PER_BOARD = 5
MAX_PENDING_SENT = 15
MAX_PENDING_RECEIVED = 10
MAX_BLOCKS = 50
MAX_PENDING_PER_MANAGER = 3
REINVITE_WAIT = timedelta(hours=24)
INVITE_LIFETIME = timedelta(days=14)

CANT_INVITE = "This user can't be invited right now."
PENDING = Invitation.Status.PENDING

def expire_old_invitations():
    """Cancel pending invitations older than 14 days so they stop using up the limits."""
    cutoff = timezone.now() - INVITE_LIFETIME
    Invitation.objects.filter(status=PENDING, created_at__lt=cutoff).update(
        status=Invitation.Status.CANCELLED, responded_at=timezone.now()
    )

def _visible_board(user, board_id):
    return Board.objects.filter(
        Q(owner=user) | Q(collaborators=user), pk=board_id
    ).distinct().first()


def _can_invite(role):
    return role in ('owner', 'manager')


def _invite_dict(inv):
    return {
        'id': inv.id,
        'board': inv.board_id,
        'board_name': inv.board.name,
        'inviter': inv.inviter.username,
        'invitee': inv.invitee.username,
        'role': inv.role,
        'created_at': inv.created_at,
    }


class BoardInvitationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'invite_send'

    def get_throttles(self):
        throttles = super().get_throttles()
        # Sending an invite also counts against the 15-an-hour limit
        if self.request.method == 'POST':
            throttles.append(ScopedRateThrottle())
        return throttles

    def get(self, request, board_id):
        expire_old_invitations()
        board = _visible_board(request.user, board_id)
        if board is None:
            return Response({'detail': 'Not found.'}, status=404)
        role = get_role(request.user, board)
        if not _can_invite(role):
            return Response({'detail': 'Only the owner or a manager can see pending invitations.'}, status=403)
        pending = board.invitations.filter(status=PENDING).select_related('board', 'inviter', 'invitee')
        if role == 'manager':
            pending = pending.filter(inviter=request.user)
        return Response([_invite_dict(i) for i in pending])

    def post(self, request, board_id):
        expire_old_invitations()
        board = _visible_board(request.user, board_id)
        if board is None:
            return Response({'detail': 'Not found.'}, status=404)
        actor_role = get_role(request.user, board)
        if not _can_invite(actor_role):
            return Response({'detail': 'Only the owner or a manager can invite people.'}, status=403)

        role = request.data.get('role', BoardMembership.Role.EDITOR)
        allowed_roles = ('viewer', 'editor', 'manager') if actor_role == 'owner' else ('viewer', 'editor')
        if role not in allowed_roles:
            return Response({'detail': "You can't invite someone with that role."}, status=403)

        username = str(request.data.get('username', '')).strip()
        if not username:
            return Response({'detail': 'Enter a username.'}, status=400)
        invitee = User.objects.filter(username=username).first()
        if invitee is None:
            return Response({'detail': 'No user with that username exists.'}, status=400)
        if invitee.id == request.user.id:
            return Response({'detail': "You can't invite yourself."}, status=400)

        with transaction.atomic():
            locked = Board.objects.select_for_update().get(pk=board.pk)

            if invitee.id == locked.owner_id or locked.collaborators.filter(pk=invitee.pk).exists():
                return Response({'detail': 'That user is already on this board.'}, status=400)
            if locked.invitations.filter(invitee=invitee, status=PENDING).exists():
                return Response({'detail': 'That user already has a pending invitation.'}, status=400)
            if UserBlock.objects.filter(blocker=invitee, blocked=request.user).exists():
                return Response({'detail': CANT_INVITE}, status=400)
            cutoff = timezone.now() - REINVITE_WAIT
            if Invitation.objects.filter(
                board=locked, invitee=invitee,
                status=Invitation.Status.DECLINED, responded_at__gte=cutoff,
            ).exists():
                return Response({'detail': CANT_INVITE}, status=400)

            pending_here = locked.invitations.filter(status=PENDING).count()
            if locked.collaborators.count() + pending_here >= MAX_MEMBERS_PER_BOARD:
                return Response({'detail': 'This board is full.'}, status=400)
            if pending_here >= MAX_PENDING_PER_BOARD:
                return Response({'detail': 'Too many pending invitations on this board.'}, status=400)
            if Invitation.objects.filter(inviter=request.user, status=PENDING).count() >= MAX_PENDING_SENT:
                return Response({'detail': 'You have too many pending invitations. Cancel some first.'}, status=400)
            if (
                actor_role == 'manager'
                and locked.invitations.filter(inviter=request.user, status=PENDING).count() >= MAX_PENDING_PER_MANAGER
            ):
                return Response({'detail': 'You have too many pending invitations on this board.'}, status=400)
            if Invitation.objects.filter(invitee=invitee, status=PENDING).count() >= MAX_PENDING_RECEIVED:
                return Response({'detail': CANT_INVITE}, status=400)

            invitation = Invitation.objects.create(
                board=locked, inviter=request.user, invitee=invitee, role=role,
            )
        notify(invitee, 'invited', f'{request.user.username} invited you to "{board.name}".', board.id)

        return Response(_invite_dict(invitation), status=201)


class MyInvitationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        expire_old_invitations()
        pending = Invitation.objects.filter(
            invitee=request.user, status=PENDING
        ).select_related('board', 'inviter', 'invitee')
        return Response([_invite_dict(i) for i in pending])


class InvitationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        invitation = Invitation.objects.select_related('board').filter(pk=pk, status=PENDING).first()
        allowed = False
        if invitation:
            board_role = get_role(request.user, invitation.board)
            allowed = board_role == 'owner' or (
                invitation.inviter_id == request.user.id and board_role == 'manager'
            )
        if not allowed:
            return Response({'detail': 'Not found.'}, status=404)
        invitation.status = Invitation.Status.CANCELLED
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=['status', 'responded_at'])
        notify(
            invitation.invitee, 'invite_cancelled',
            f'Your invitation to "{invitation.board.name}" was cancelled.', invitation.board_id,
        )
        return Response({'detail': 'Invitation cancelled.'})


class AcceptInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        with transaction.atomic():
            invitation = Invitation.objects.select_for_update().filter(
                pk=pk, invitee=request.user, status=PENDING
            ).first()
            if invitation is None:
                return Response({'detail': 'Not found.'}, status=404)
            board = invitation.board
            if board.collaborators.count() >= MAX_MEMBERS_PER_BOARD:
                return Response({'detail': 'This board is full.'}, status=400)

            board.collaborators.add(request.user)
            BoardMembership.objects.get_or_create(
                board=board, user=request.user, defaults={'role': invitation.role}
            )
            invitation.status = Invitation.Status.ACCEPTED
            invitation.responded_at = timezone.now()
            invitation.save(update_fields=['status', 'responded_at'])
        notify(
            invitation.inviter, 'invite_accepted',
            f'{request.user.username} accepted your invitation to "{board.name}".', board.id,
        )
        broadcast_board_event(board.id, 'collaborator_added', request, username=request.user.username)
        return Response({'detail': 'Invitation accepted.', 'board': board.id})


class DeclineInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        invitation = Invitation.objects.filter(pk=pk, invitee=request.user, status=PENDING).first()
        if invitation is None:
            return Response({'detail': 'Not found.'}, status=404)

        want_block = request.data.get('block') is True
        if want_block:
            already = UserBlock.objects.filter(blocker=request.user, blocked_id=invitation.inviter_id).exists()
            if not already and UserBlock.objects.filter(blocker=request.user).count() >= MAX_BLOCKS:
                return Response({'detail': 'Your block list is full.'}, status=400)
            UserBlock.objects.get_or_create(blocker=request.user, blocked_id=invitation.inviter_id)

        invitation.status = Invitation.Status.DECLINED
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=['status', 'responded_at'])
        return Response({'detail': 'Invitation declined.', 'blocked': want_block})


class BlocksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        names = UserBlock.objects.filter(blocker=request.user).values_list('blocked__username', flat=True)
        return Response(list(names))


class UnblockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, username):
        deleted, _ = UserBlock.objects.filter(blocker=request.user, blocked__username=username).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=404)
        return Response({'detail': 'Unblocked.'})


class SentInvitationsView(APIView):
    """Pending invitations you have sent, across all boards."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        expire_old_invitations()
        pending = Invitation.objects.filter(
            inviter=request.user, status=PENDING
        ).select_related('board', 'inviter', 'invitee')
        return Response([_invite_dict(i) for i in pending])


class InvitationLimitsView(APIView):
    """Your current invitation counts against the limits, for the Invitations page."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({
            'pending_sent': Invitation.objects.filter(inviter=request.user, status=PENDING).count(),
            'max_pending_sent': MAX_PENDING_SENT,
            'pending_received': Invitation.objects.filter(invitee=request.user, status=PENDING).count(),
            'max_pending_received': MAX_PENDING_RECEIVED,
            'blocked': UserBlock.objects.filter(blocker=request.user).count(),
            'max_blocks': MAX_BLOCKS,
            'max_members_per_board': MAX_MEMBERS_PER_BOARD,
            'max_pending_per_board': MAX_PENDING_PER_BOARD,
            'invites_per_hour': 15,
        })