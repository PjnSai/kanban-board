from datetime import timedelta

import pytest
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from boards import invitation_views as iv
from boards.models import Board, BoardMembership, Invitation


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


def make_user(name):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='testpass123')


def client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def invite(client, board, username):
    return client.post(f'/api/boards/{board.id}/invitations/', {'username': username}, format='json')


@pytest.fixture
def people(db):
    return make_user('alice'), make_user('bob'), make_user('carol')


@pytest.mark.django_db
def test_owner_can_invite(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    response = invite(client_for(alice), board, 'bob')
    assert response.status_code == 201
    assert Invitation.objects.filter(board=board, invitee=bob, status='pending').exists()
    assert not board.collaborators.filter(pk=bob.pk).exists()


@pytest.mark.django_db
def test_only_the_owner_can_invite(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    board.collaborators.add(bob)
    assert invite(client_for(bob), board, 'carol').status_code == 403
    assert invite(client_for(carol), board, 'bob').status_code == 404


@pytest.mark.django_db
def test_invite_validation(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    board.collaborators.add(bob)
    client = client_for(alice)
    assert invite(client, board, 'nobody').status_code == 400
    assert invite(client, board, 'alice').status_code == 400
    assert invite(client, board, 'bob').status_code == 400
    assert invite(client, board, 'carol').status_code == 201
    assert invite(client, board, 'carol').status_code == 400


@pytest.mark.django_db
def test_board_caps(people, monkeypatch):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    monkeypatch.setattr(iv, 'MAX_PENDING_PER_BOARD', 1)
    client = client_for(alice)
    assert invite(client, board, 'bob').status_code == 201
    assert invite(client, board, 'carol').status_code == 400


@pytest.mark.django_db
def test_member_cap_counts_pending_invites(people, monkeypatch):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    board.collaborators.add(bob)
    monkeypatch.setattr(iv, 'MAX_MEMBERS_PER_BOARD', 2)
    client = client_for(alice)
    assert invite(client, board, 'carol').status_code == 201
    extra = make_user('dave')
    assert invite(client, board, extra.username).status_code == 400


@pytest.mark.django_db
def test_sent_and_received_caps(people, monkeypatch):
    alice, bob, carol = people
    board1 = Board.objects.create(name='One', owner=alice)
    board2 = Board.objects.create(name='Two', owner=alice)
    monkeypatch.setattr(iv, 'MAX_PENDING_SENT', 1)
    assert invite(client_for(alice), board1, 'bob').status_code == 201
    assert invite(client_for(alice), board2, 'carol').status_code == 400

    monkeypatch.setattr(iv, 'MAX_PENDING_SENT', 15)
    monkeypatch.setattr(iv, 'MAX_PENDING_RECEIVED', 1)
    other_board = Board.objects.create(name='Other', owner=carol)
    assert invite(client_for(carol), other_board, 'bob').status_code == 400


@pytest.mark.django_db
def test_accept_adds_member(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    invitation_id = invite(client_for(alice), board, 'bob').data['id']

    assert client_for(carol).post(f'/api/invitations/{invitation_id}/accept/').status_code == 404
    response = client_for(bob).post(f'/api/invitations/{invitation_id}/accept/')
    assert response.status_code == 200
    assert board.collaborators.filter(pk=bob.pk).exists()
    assert BoardMembership.objects.filter(board=board, user=bob, role='editor').exists()
    assert Invitation.objects.get(pk=invitation_id).status == 'accepted'


@pytest.mark.django_db
def test_decline_has_a_24_hour_wait(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    owner = client_for(alice)
    invitation_id = invite(owner, board, 'bob').data['id']
    assert client_for(bob).post(f'/api/invitations/{invitation_id}/decline/').status_code == 200

    assert invite(owner, board, 'bob').status_code == 400
    Invitation.objects.filter(pk=invitation_id).update(responded_at=timezone.now() - timedelta(hours=25))
    assert invite(owner, board, 'bob').status_code == 201


@pytest.mark.django_db
def test_decline_and_block(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    invitation_id = invite(client_for(alice), board, 'bob').data['id']
    response = client_for(bob).post(f'/api/invitations/{invitation_id}/decline/', {'block': True}, format='json')
    assert response.status_code == 200
    assert client_for(bob).get('/api/blocks/').data == ['alice']

    Invitation.objects.all().update(responded_at=timezone.now() - timedelta(hours=25))
    assert invite(client_for(alice), board, 'bob').status_code == 400

    assert client_for(bob).delete('/api/blocks/alice/').status_code == 200
    assert invite(client_for(alice), board, 'bob').status_code == 201


@pytest.mark.django_db
def test_owner_can_cancel_a_pending_invite(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    invitation_id = invite(client_for(alice), board, 'bob').data['id']

    assert client_for(carol).delete(f'/api/invitations/{invitation_id}/').status_code == 404
    assert client_for(alice).delete(f'/api/invitations/{invitation_id}/').status_code == 200
    assert client_for(bob).get('/api/invitations/').data == []
    assert client_for(bob).post(f'/api/invitations/{invitation_id}/accept/').status_code == 404


@pytest.mark.django_db
def test_invitee_sees_who_invited_them(people):
    alice, bob, carol = people
    board = Board.objects.create(name='Roadmap', owner=alice)
    invite(client_for(alice), board, 'bob')
    data = client_for(bob).get('/api/invitations/').data
    assert len(data) == 1
    assert data[0]['inviter'] == 'alice' and data[0]['board_name'] == 'Roadmap'


@pytest.mark.django_db
def test_invites_are_throttled(people):
    alice, bob, carol = people
    board = Board.objects.create(name='B', owner=alice)
    limit = int(settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['invite_send'].split('/')[0])
    client = client_for(alice)
    for _ in range(limit):
        assert invite(client, board, 'nobody').status_code == 400
    assert invite(client, board, 'nobody').status_code == 429