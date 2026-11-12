import pytest
from django.contrib.auth.models import User
from boards.models import Notification

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


@pytest.mark.django_db
def test_notification_can_be_saved():
    user = User.objects.create_user(username='alice', email='a@example.com', password='testpass123')
    Notification.objects.create(user=user, kind='invited', message='bob invited you to Roadmap', board_id=5)
    assert user.notifications.filter(read_at__isnull=True).count() == 1

from boards.models import Board, BoardMembership, Invitation
from boards import notifications as notif_module


def make_user(name):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='testpass123')


def client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


@pytest.mark.django_db
def test_invite_accept_and_cancel_create_the_right_notifications():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='Roadmap', owner=alice)

    first = client_for(alice).post(f'/api/boards/{board.id}/invitations/', {'username': 'bob'}, format='json').data['id']
    assert Notification.objects.filter(user=bob, kind='invited').count() == 1

    client_for(alice).delete(f'/api/invitations/{first}/')
    assert Notification.objects.filter(user=bob, kind='invite_cancelled').count() == 1

    second = client_for(alice).post(f'/api/boards/{board.id}/invitations/', {'username': 'bob'}, format='json').data['id']
    client_for(bob).post(f'/api/invitations/{second}/accept/')
    assert Notification.objects.filter(user=alice, kind='invite_accepted').count() == 1


@pytest.mark.django_db
def test_declining_notifies_nobody():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='Roadmap', owner=alice)
    invitation_id = client_for(alice).post(f'/api/boards/{board.id}/invitations/', {'username': 'bob'}, format='json').data['id']
    client_for(bob).post(f'/api/invitations/{invitation_id}/decline/')
    assert Notification.objects.filter(user=alice).count() == 0


@pytest.mark.django_db
def test_removal_role_change_and_board_deletion_notify_the_member():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='Roadmap', owner=alice)
    board.collaborators.add(bob)
    BoardMembership.objects.create(board=board, user=bob, role='editor')

    client_for(alice).post(f'/api/boards/{board.id}/set-role/', {'username': 'bob', 'role': 'viewer'}, format='json')
    assert Notification.objects.filter(user=bob, kind='role_changed').count() == 1

    client_for(alice).post(f'/api/boards/{board.id}/remove-collaborator/', {'username': 'bob'}, format='json')
    assert Notification.objects.filter(user=bob, kind='removed').count() == 1

    board.collaborators.add(bob)
    BoardMembership.objects.create(board=board, user=bob, role='editor')
    response = client_for(alice).delete(f'/api/boards/{board.id}/')
    assert response.status_code == 204
    assert Notification.objects.filter(user=bob, kind='board_deleted').count() == 1
    


@pytest.mark.django_db
def test_list_and_mark_read_only_touch_your_own():
    alice, bob = make_user('alice'), make_user('bob')
    mine = Notification.objects.create(user=alice, kind='invited', message='one')
    theirs = Notification.objects.create(user=bob, kind='invited', message='two')

    data = client_for(alice).get('/api/notifications/').data
    assert data['unread'] == 1 and len(data['notifications']) == 1

    assert client_for(alice).post(f'/api/notifications/{theirs.id}/read/').data['updated'] == 0
    assert client_for(alice).post(f'/api/notifications/{mine.id}/read/').data['updated'] == 1
    assert client_for(alice).get('/api/notifications/').data['unread'] == 0
    assert client_for(bob).get('/api/notifications/').data['unread'] == 1


@pytest.mark.django_db
def test_mark_all_read():
    alice = make_user('alice')
    for i in range(3):
        Notification.objects.create(user=alice, kind='invited', message=str(i))
    assert client_for(alice).post('/api/notifications/read-all/').data['updated'] == 3
    assert client_for(alice).get('/api/notifications/').data['unread'] == 0


@pytest.mark.django_db
def test_notifications_are_capped_and_old_read_ones_pruned(monkeypatch):
    from datetime import timedelta
    from django.utils import timezone
    alice = make_user('alice')
    monkeypatch.setattr(notif_module, 'MAX_PER_USER', 3)

    for i in range(5):
        notif_module.notify(alice, 'invited', f'n{i}')
    assert Notification.objects.filter(user=alice).count() == 3

    old = Notification.objects.create(
        user=alice, kind='invited', message='old', read_at=timezone.now() - timedelta(days=31)
    )
    notif_module.notify(alice, 'invited', 'fresh')
    assert not Notification.objects.filter(pk=old.pk).exists()


@pytest.mark.django_db
def test_notifications_require_login():
    assert APIClient().get('/api/notifications/').status_code == 401

@pytest.mark.django_db
def test_leaving_notifies_the_owner_and_managers():
    alice, bob, carol = make_user('alice'), make_user('bob'), make_user('carol')
    board = Board.objects.create(name='Roadmap', owner=alice)
    for user, role in ((bob, 'manager'), (carol, 'editor')):
        board.collaborators.add(user)
        BoardMembership.objects.create(board=board, user=user, role=role)

    response = client_for(carol).post(f'/api/boards/{board.id}/leave/')
    assert response.status_code == 200

    assert Notification.objects.filter(user=alice, kind='member_left').count() == 1
    assert Notification.objects.filter(user=bob, kind='member_left').count() == 1
    assert not Notification.objects.filter(user=carol).exists()