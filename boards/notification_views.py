from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core import signing
from rest_framework.throttling import ScopedRateThrottle
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
        rows = Notification.objects.filter(user=request.user)[:50]
        unread = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        return Response({'unread': unread, 'notifications': [_row(n) for n in rows]})


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