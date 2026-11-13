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
    }


class NotificationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get('limit', 50))
        except ValueError:
            limit = 50
        limit = max(1, min(limit, 50))
        rows = Notification.objects.filter(user=request.user)[:limit]
        unread = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        total = Notification.objects.filter(user=request.user).count()
        return Response({'unread': unread, 'total': total, 'notifications': [_row(n) for n in rows]})

    def delete(self, request):
        """Clear notifications. ?scope=read clears only read ones; anything else clears all."""
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