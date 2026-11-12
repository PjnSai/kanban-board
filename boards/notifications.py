from datetime import timedelta

from django.utils import timezone

from .models import Notification

MAX_PER_USER = 50
KEEP_READ_FOR = timedelta(days=30)


def notify(user, kind, message, board_id=None):
    """Save a notification for a user, keeping their log small. Never raises."""
    try:
        Notification.objects.create(user=user, kind=kind, message=message[:300], board_id=board_id)

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
        # A failed notification must never break the action that caused it
        import logging
        logging.getLogger(__name__).exception('Could not save notification')