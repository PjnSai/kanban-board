from django.core import signing
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Notification


def _row(n):
    return {
        'id': n.id,
        'kind': n.kind,
        'message': n.message,
        'board_id': n.board_id,
        'created_at': n.created_at,
        'read': n.read_at is not None,
        'dismissed': n.dismissed_at is not None,
    }


class NotificationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get('limit', 50))
        except ValueError:
            limit = 50
        limit = max(1, min(limit, 50))

        mine = Notification.objects.filter(user=request.user)
        rows = mine
        if request.query_params.get('scope') == 'bell':
            rows = mine.filter(dismissed_at__isnull=True)
        return Response({
            'unread': mine.filter(read_at__isnull=True).count(),
            'total': mine.count(),
            'bell_total': mine.filter(dismissed_at__isnull=True).count(),
            'notifications': [_row(n) for n in rows[:limit]],
        })

    def delete(self, request):
        """Permanently clear notifications. ?scope=read clears only read ones; anything else clears all."""
        queryset = Notification.objects.filter(user=request.user)
        if request.query_params.get('scope') == 'read':
            queryset = queryset.filter(read_at__isnull=False)
        deleted, _ = queryset.delete()
        return Response({'deleted': deleted})


class NotificationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        deleted, _ = Notification.objects.filter(pk=pk, user=request.user).delete()
        if not deleted:
            return Response({'detail': 'Not found.'}, status=404)
        return Response({'deleted': deleted})


class DismissView(APIView):
    """Hide one notification from the bell. It stays on the Notifications page, marked read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        notification = Notification.objects.filter(pk=pk, user=request.user).first()
        if notification is None:
            return Response({'detail': 'Not found.'}, status=404)
        now = timezone.now()
        notification.dismissed_at = notification.dismissed_at or now
        notification.read_at = notification.read_at or now
        notification.save(update_fields=['dismissed_at', 'read_at'])
        return Response({'dismissed': 1})


class DismissAllView(APIView):
    """Hide everything from the bell. Nothing is deleted."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        now = timezone.now()
        queryset = Notification.objects.filter(user=request.user, dismissed_at__isnull=True)
        queryset.filter(read_at__isnull=True).update(read_at=now)
        dismissed = queryset.update(dismissed_at=now)
        return Response({'dismissed': dismissed})


class MarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        updated = Notification.objects.filter(
            pk=pk, user=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({'updated': updated})


class MarkAllReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, read_at__isnull=True
        ).update(read_at=timezone.now())
        return Response({'updated': updated})


class NotificationsTicketView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'user_ticket'

    def get_throttles(self):
        throttles = super().get_throttles()
        throttles.append(ScopedRateThrottle())
        return throttles

    def get(self, request):
        ticket = signing.dumps({'user': request.user.id}, salt='ws-user-ticket')
        return Response({'ticket': ticket})