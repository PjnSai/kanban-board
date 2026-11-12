import pytest
from django.contrib.auth.models import User
from boards.models import Notification


@pytest.mark.django_db
def test_notification_can_be_saved():
    user = User.objects.create_user(username='alice', email='a@example.com', password='testpass123')
    Notification.objects.create(user=user, kind='invited', message='bob invited you to Roadmap', board_id=5)
    assert user.notifications.filter(read_at__isnull=True).count() == 1