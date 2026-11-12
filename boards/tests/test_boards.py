import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from boards.models import Board


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


def client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def make_user(name):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='testpass123')


@pytest.fixture
def setup(db):
    alice, bob, carol = make_user('alice'), make_user('bob'), make_user('carol')
    board = Board.objects.create(name='Original', owner=alice)
    board.collaborators.add(bob)
    return alice, bob, carol, board


@pytest.mark.django_db
def test_owner_can_rename_board(setup):
    alice, bob, carol, board = setup
    response = client_for(alice).patch(f'/api/boards/{board.id}/', {'name': 'Renamed'}, format='json')
    assert response.status_code == 200
    board.refresh_from_db()
    assert board.name == 'Renamed'


@pytest.mark.django_db
def test_collaborator_cannot_rename_board(setup):
    alice, bob, carol, board = setup
    response = client_for(bob).patch(f'/api/boards/{board.id}/', {'name': 'Hijacked'}, format='json')
    assert response.status_code == 403
    board.refresh_from_db()
    assert board.name == 'Original'


@pytest.mark.django_db
def test_collaborator_cannot_change_board_position(setup):
    alice, bob, carol, board = setup
    response = client_for(bob).patch(f'/api/boards/{board.id}/', {'position': 5}, format='json')
    assert response.status_code == 403
    board.refresh_from_db()
    assert board.position != 5


@pytest.mark.django_db
def test_stranger_cannot_touch_board(setup):
    alice, bob, carol, board = setup
    assert client_for(carol).patch(f'/api/boards/{board.id}/', {'name': 'X'}, format='json').status_code == 404
    assert client_for(carol).get(f'/api/boards/{board.id}/').status_code == 404

@pytest.mark.django_db
def test_old_add_collaborator_endpoint_is_gone(setup):
    alice, bob, carol, board = setup
    response = client_for(alice).post(
        f'/api/boards/{board.id}/add-collaborator/', {'username': 'carol'}, format='json'
    )
    assert response.status_code == 404
    assert not board.collaborators.filter(username='carol').exists()


@pytest.mark.django_db
def test_membership_removed_when_collaborator_is_removed(setup):
    from boards.models import BoardMembership
    alice, bob, carol, board = setup
    BoardMembership.objects.get_or_create(board=board, user=bob, defaults={'role': 'editor'})

    client_for(alice).post(f'/api/boards/{board.id}/remove-collaborator/', {'username': 'bob'}, format='json')

    assert not board.collaborators.filter(pk=bob.pk).exists()
    assert not BoardMembership.objects.filter(board=board, user=bob).exists()


@pytest.mark.django_db
def test_leaving_removes_membership(setup):
    from boards.models import BoardMembership
    alice, bob, carol, board = setup
    BoardMembership.objects.get_or_create(board=board, user=bob, defaults={'role': 'editor'})

    response = client_for(bob).post(f'/api/boards/{board.id}/leave/')

    assert response.status_code == 200
    assert not BoardMembership.objects.filter(board=board, user=bob).exists()

@pytest.mark.django_db
def test_removing_a_member_sends_a_disconnect(setup, monkeypatch):
    from boards import views
    alice, bob, carol, board = setup
    sent = []
    monkeypatch.setattr(views, 'disconnect_member', lambda board_id, user_id: sent.append((board_id, user_id)))

    client_for(alice).post(f'/api/boards/{board.id}/remove-collaborator/', {'username': 'bob'}, format='json')
    assert sent == [(board.id, bob.id)]

    board.collaborators.add(carol)
    client_for(carol).post(f'/api/boards/{board.id}/leave/')
    assert sent[-1] == (board.id, carol.id)