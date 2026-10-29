from rest_framework import viewsets
from .models import Board, List, Card
from .serializers import BoardSerializer, ListSerializer, CardSerializer
from rest_framework import generics, viewsets, permissions 
from .serializers import RegisterSerializer
from django.contrib.auth.models import User
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import CollaboratorSerializer
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.core.cache import cache
from datetime import date
from rest_framework.throttling import AnonRateThrottle
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework_simplejwt.token_blacklist.models import (
    OutstandingToken,
    BlacklistedToken,
)
import os
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.cache import cache
from django.utils import timezone
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, SimpleRateThrottle
from django.core.validators import validate_email as django_validate_email
import logging
from rest_framework_simplejwt.views import TokenObtainPairView

DAILY_EMAIL_LIMIT = 300

def within_daily_limit(email, limit=5):
    key = f"pwreset:daily:{email.lower()}:{timezone.now().date()}"
    cache.add(key, 0, timeout=86400)
    return cache.incr(key) <= limit

def _email_quota_exceeded():
    key = f'password_reset_count:{date.today().isoformat()}'
    return cache.get(key, 0) >= DAILY_EMAIL_LIMIT

def _increment_email_quota():
    key = f'password_reset_count:{date.today().isoformat()}'
    cache.set(key, cache.get(key, 0) + 1, timeout=60 * 60 * 26)

def _cooldown_key(email):
    return f'password_reset_cooldown:{email.lower()}'

class PasswordResetThrottle(AnonRateThrottle):
    scope = 'password_reset'


class BoardViewSet(viewsets.ModelViewSet):
    serializer_class = BoardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Board.objects.filter(Q(owner=user) | Q(collaborators=user)).distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied("Only the board owner can delete this board.")
        instance.delete()


    @action(detail=True, methods=['post'], url_path='add-collaborator')
    def add_collaborator(self, request, pk=None):
        board = self.get_object()
        if board.owner != request.user:
            return Response({'detail': 'Only the owner can add collaborators.'}, status=403)

        serializer = CollaboratorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['username']

        if user == board.owner:
            return Response({'detail': 'Owner is already on the board.'}, status=400)

        board.collaborators.add(user)

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board.id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'collaborator_added',
                    'username': user.username,
                    'origin': request.headers.get('X-Client-Id', ''),
                },
            }
        )
        return Response({'detail': f'{user.username} added.'}, status=200)

    @action(detail=True, methods=['post'], url_path='leave')
    def leave(self, request, pk=None):
        board = self.get_object()
        if board.owner == request.user:
            return Response({'detail': 'Owners cannot leave their own board. Delete it instead.'}, status=400)
        board.collaborators.remove(request.user)
        return Response({'detail': 'You have left the board.'}, status=200)

    @action(detail=True, methods=['post'], url_path='remove-collaborator')
    def remove_collaborator(self, request, pk=None):
        board = self.get_object()
        if board.owner != request.user:
            return Response({'detail': 'Only the owner can remove collaborators.'}, status=403)

        serializer = CollaboratorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['username']

        board.collaborators.remove(user)

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board.id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'collaborator_removed',
                    'username': user.username,
                    'origin': request.headers.get('X-Client-Id', ''),
                },
            }
        )
        return Response({'detail': f'{user.username} removed.'}, status=200)


class ListViewSet(viewsets.ModelViewSet):
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return List.objects.filter(Q(board__owner=user) | Q(board__collaborators=user)).distinct()

    def perform_create(self, serializer):
        list_obj = serializer.save()
        board_id = list_obj.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'list_created',
                    'list_id': list_obj.id,
                    'name': list_obj.name,
                    'position': list_obj.position,
                    'origin': client_id,
                },
            }
        )

    

    def perform_update(self, serializer):
        list_obj = serializer.save()
        board_id = list_obj.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'list_moved',
                    'list_id': list_obj.id,
                    'name': list_obj.name,
                    'position': list_obj.position,
                    'origin': client_id,
                },
            }
        )

    def perform_destroy(self, instance):
            board_id = instance.board.id
            list_id = instance.id
            client_id = self.request.headers.get('X-Client-Id', '')
            instance.delete()
    
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'board_{board_id}',
                {
                    'type': 'board_message',
                    'message': {
                        'event': 'list_deleted',
                        'list_id': list_id,
                        'origin': client_id,
                    },
                }
            )


class CardViewSet(viewsets.ModelViewSet):
    serializer_class = CardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Card.objects.filter(Q(list__board__owner=user) | Q(list__board__collaborators=user)).distinct()

    def perform_create(self, serializer):
        card = serializer.save()
        board_id = card.list.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'card_created',
                    'card_id': card.id,
                    'list_id': card.list.id,
                    'title': card.title,
                    'position': card.position,
                    'origin': client_id,
                },
            }
        )

    def perform_update(self, serializer):
        card = serializer.save()
        board_id = card.list.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'card_moved',
                    'card_id': card.id,
                    'list_id': card.list.id,
                    'title': card.title,
                    'position': card.position,
                    'origin': client_id,
                },
            }
        )

    def perform_destroy(self, instance):
        board_id = instance.list.board.id
        card_id = instance.id
        client_id = self.request.headers.get('X-Client-Id', '')
        instance.delete()

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'card_deleted',
                    'card_id': card_id,
                    'origin': client_id,
                },
            }
        )

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(status=205)
        except Exception:
            return Response(status=400)

class DeleteAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'account_sensitive'

    def delete(self, request):
        if not request.user.check_password(request.data.get('password', '')):
            return Response({'detail': 'Your password is incorrect.'}, status=400)
        request.user.delete()
        return Response(status=204)

logger = logging.getLogger(__name__)


def _mask_email(email):
    name, _, domain = email.partition('@')
    return f"{name[:1]}***@{domain}" if name else email


def _send_security_notice(to_email, subject, message):
    # A failed or skipped notice must never break the change itself
    if _email_quota_exceeded():
        return
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [to_email])
        _increment_email_quota()
    except Exception:
        logger.exception('Failed to send security notice')

class LoginThrottle(SimpleRateThrottle):
    scope = 'login'

    def get_cache_key(self, request, view):
        username = str(request.data.get('username', '')).lower()[:150]
        ident = f'{self.get_ident(request)}:{username}'
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class LoginView(TokenObtainPairView):
    throttle_classes = [AnonRateThrottle, LoginThrottle]

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'date_joined': user.date_joined,
            'boards_owned': Board.objects.filter(owner=user).count(),
        })


class ChangeEmailView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'account_sensitive'

    def post(self, request):
        user = request.user
        password = request.data.get('password', '')
        new_email = request.data.get('email', '').strip().lower()

        if not user.check_password(password):
            return Response({'detail': 'Your password is incorrect.'}, status=400)

        try:
            django_validate_email(new_email)
        except ValidationError:
            return Response({'detail': 'Enter a valid email address.'}, status=400)

        if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
            return Response({'detail': 'A user with that email already exists.'}, status=400)

        old_email = user.email
        user.email = new_email
        user.save(update_fields=['email'])

        if old_email:
            _send_security_notice(
                old_email,
                'Your Kanban Board email address was changed',
                f'The email address on your Kanban Board account "{user.username}" was changed to {_mask_email(new_email)}.\n\n'
                'If you made this change, no action is needed. If you did not, someone else may have access to your account, so please contact the site owner.',
            )
        return Response({'email': user.email}, status=200)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'account_sensitive'

    def post(self, request):
        user = request.user
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')

        if not current_password or not new_password:
            return Response({'detail': 'Please fill in both password fields.'}, status=400)

        if not user.check_password(current_password):
            return Response({'detail': 'Your current password is incorrect.'}, status=400)

        if current_password == new_password:
            return Response({'detail': 'Your new password must be different from the current one.'}, status=400)

        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response({'detail': e.messages}, status=400)

        user.set_password(new_password)
        user.save()
        _revoke_refresh_tokens(user)

        if user.email:
            _send_security_notice(
                user.email,
                'Your Kanban Board password was changed',
                f'The password for your Kanban Board account "{user.username}" was just changed, and you were logged out of all devices.\n\n'
                'If this was you, no action is needed. If not, use "Forgot your password?" on the login page to reset it straight away.',
            )
        return Response({'detail': 'Password changed. Please log in again.'}, status=200)



class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        generic_response = Response(
            {'detail': 'If that email is registered, a reset link has been sent.'},
            status=200
        )

        if not email:
            return generic_response

        if cache.get(_cooldown_key(email)):
            return Response(
                {'detail': 'A reset email was already sent recently. Please check your inbox or wait a minute before trying again.'},
                status=429
            )

        if _email_quota_exceeded():
            return Response(
                {'detail': "We've reached our daily limit for password reset emails. Please try again tomorrow."},
                status=429
            )

        # Applies to every email, registered or not, so responses never reveal which exist
        cache.set(_cooldown_key(email), True, timeout=60)

        if not within_daily_limit(email):
            return generic_response
        users = User.objects.filter(email__iexact=email, is_active=True)
        if not users.exists():
            return generic_response

        frontend_url = os.environ['FRONTEND_URL']

        for user in users:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_link = f'{frontend_url}/reset-password/{uid}/{token}/'

            # plain_message and html_message 

            
            plain_message = f'Click the link to reset your password: {reset_link}\n\nThis link expires in 20 minutes. If you did not request this, ignore this email.'
            html_message = f'''
            <p>We received a request to reset your Kanban Board password.</p>
            <p><a href="{reset_link}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Reset your password</a></p>
            <p>Or copy and paste this link into your browser:<br>{reset_link}</p>
            <p style="color:#64748b;font-size:13px;">This link expires in 20 minutes. If you did not request this, you can safely ignore this email.</p>
            '''

            email_message = EmailMultiAlternatives(
                subject='Reset your Kanban Board password',
                body=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[user.email],
            )
            email_message.attach_alternative(html_message, 'text/html')
            email_message.send()
            _increment_email_quota()

        return generic_response


def _revoke_refresh_tokens(user):
    tokens = OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=t) for t in tokens],
        ignore_conflicts=True,
    )

class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')

        if not uid or not token or not new_password:
            return Response({'detail': 'Missing required fields.'}, status=400)

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({'detail': 'Invalid reset link.'}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'This reset link is invalid or has expired.'}, status=400)

        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response({'detail': e.messages}, status=400)

        user.set_password(new_password)
        user.save()

        _revoke_refresh_tokens(user)
        return Response({'detail': 'Password has been reset successfully.'}, status=200)