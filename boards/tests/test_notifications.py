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


@pytest.mark.django_db
def test_user_ticket_endpoint():
    from django.core import signing
    alice = make_user('alice')
    assert APIClient().get('/api/notifications/ws-ticket/').status_code == 401
    response = client_for(alice).get('/api/notifications/ws-ticket/')
    assert response.status_code == 200
    assert signing.loads(response.data['ticket'], salt='ws-user-ticket', max_age=30) == {'user': alice.id}


@pytest.mark.django_db
def test_user_ticket_is_throttled(monkeypatch):
    from django.core.cache import cache
    from rest_framework.throttling import ScopedRateThrottle
    cache.clear()
    monkeypatch.setattr(
        ScopedRateThrottle, 'THROTTLE_RATES',
        {**ScopedRateThrottle.THROTTLE_RATES, 'user_ticket': '2/hour'},
    )
    client = client_for(make_user('alice'))
    assert client.get('/api/notifications/ws-ticket/').status_code == 200
    assert client.get('/api/notifications/ws-ticket/').status_code == 200
    assert client.get('/api/notifications/ws-ticket/').status_code == 429


@pytest.mark.django_db
def test_notify_pushes_a_live_message(monkeypatch):
    sent = []
    monkeypatch.setattr(notif_module, 'push_to_user', lambda user_id, message: sent.append((user_id, message)))
    alice = make_user('alice')
    notif_module.notify(alice, 'invited', 'bob invited you', board_id=7)

    assert len(sent) == 1
    user_id, message = sent[0]
    assert user_id == alice.id
    assert message['event'] == 'notification' and message['kind'] == 'invited' and message['board_id'] == 7


@pytest.mark.django_db
def test_a_failed_push_does_not_lose_the_notification(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError('redis down')
    monkeypatch.setattr(notif_module, 'get_channel_layer', boom)
    alice = make_user('alice')
    notif_module.notify(alice, 'invited', 'x')
    assert Notification.objects.filter(user=alice).count() == 1


@pytest.mark.django_db
def test_changing_password_closes_live_connections(monkeypatch):
    from boards import views
    closed = []
    monkeypatch.setattr(views, 'disconnect_user_sockets', lambda user_id: closed.append(user_id))
    alice = make_user('alice')
    client_for(alice).post(
        '/api/auth/change-password/',
        {'current_password': 'testpass123', 'new_password': 'Str0ng-Pass-9271'},
        format='json',
    )
    assert closed == [alice.id]

@pytest.mark.django_db
def test_list_limit_and_total():
    alice = make_user('alice')
    for i in range(7):
        Notification.objects.create(user=alice, kind='invited', message=str(i))
    data = client_for(alice).get('/api/notifications/?limit=5').data
    assert len(data['notifications']) == 5 and data['total'] == 7
    assert len(client_for(alice).get('/api/notifications/?limit=abc').data['notifications']) == 7
    assert len(client_for(alice).get('/api/notifications/?limit=999').data['notifications']) == 7


@pytest.mark.django_db
def test_delete_one_notification_only_deletes_your_own():
    alice, bob = make_user('alice'), make_user('bob')
    mine = Notification.objects.create(user=alice, kind='invited', message='mine')
    theirs = Notification.objects.create(user=bob, kind='invited', message='theirs')

    assert client_for(alice).delete(f'/api/notifications/{theirs.id}/').status_code == 404
    assert Notification.objects.filter(pk=theirs.pk).exists()
    assert client_for(alice).delete(f'/api/notifications/{mine.id}/').status_code == 200
    assert not Notification.objects.filter(pk=mine.pk).exists()


@pytest.mark.django_db
def test_clear_all_and_clear_read_only():
    from django.utils import timezone
    alice, bob = make_user('alice'), make_user('bob')
    Notification.objects.create(user=alice, kind='invited', message='unread')
    Notification.objects.create(user=alice, kind='invited', message='read', read_at=timezone.now())
    Notification.objects.create(user=bob, kind='invited', message='bobs')

    assert client_for(alice).delete('/api/notifications/?scope=read').data['deleted'] == 1
    assert Notification.objects.filter(user=alice).count() == 1
    assert client_for(alice).delete('/api/notifications/').data['deleted'] == 1
    assert Notification.objects.filter(user=alice).count() == 0
    assert Notification.objects.filter(user=bob).count() == 1


@pytest.mark.django_db
def test_sent_invitations_and_limits_endpoints():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='Roadmap', owner=alice)
    client_for(alice).post(f'/api/boards/{board.id}/invitations/', {'username': 'bob'}, format='json')

    sent = client_for(alice).get('/api/invitations/sent/').data
    assert len(sent) == 1 and sent[0]['invitee'] == 'bob'
    assert client_for(bob).get('/api/invitations/sent/').data == []

    limits = client_for(alice).get('/api/invitations/limits/').data
    assert limits['pending_sent'] == 1 and limits['max_pending_sent'] == 15
    assert client_for(bob).get('/api/invitations/limits/').data['pending_received'] == 1
    assert APIClient().get('/api/invitations/limits/').status_code == 401