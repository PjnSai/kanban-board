import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from .models import Notification

logger = logging.getLogger(__name__)

MAX_PER_USER = 50
KEEP_READ_FOR = timedelta(days=30)


def push_to_user(user_id, message):
    """Send a live message to everything this user has open. Never raises."""
    try:
        async_to_sync(get_channel_layer().group_send)(
            f'user_{user_id}',
            {'type': 'user_message', 'message': message},
        )
    except Exception:
        logger.exception('Could not push a live notification')


def disconnect_user_sockets(user_id):
    """Close this user's live notification connections. Never raises."""
    try:
        async_to_sync(get_channel_layer().group_send)(
            f'user_{user_id}',
            {'type': 'force_close'},
        )
    except Exception:
        logger.exception('Could not close live notification connections')


def notify(user, kind, message, board_id=None):
    """Save a notification, keep the log small, then push it live. Never raises."""
    try:
        saved = Notification.objects.create(user=user, kind=kind, message=message[:300], board_id=board_id)

        # Prune read notifications older than 30 days
        Notification.objects.filter(
            user=user, read_at__isnull=False, read_at__lt=timezone.now() - KEEP_READ_FOR
        ).delete()

        # Keep only the newest MAX_PER_USER
        keep_ids = list(
            Notification.objects.filter(user=user).values_list('id', flat=True)[:MAX_PER_USER]
        )
        Notification.objects.filter(user=user).exclude(id__in=keep_ids).delete()
    except Exception:
        logger.exception('Could not save notification')
        return

    push_to_user(user.id, {
        'event': 'notification',
        'id': saved.id,
        'kind': kind,
        'message': saved.message,
        'board_id': board_id,
    })