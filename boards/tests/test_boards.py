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
def test_collaborator_cannot_add_collaborators(setup):
    alice, bob, carol, board = setup
    response = client_for(bob).post(
        f'/api/boards/{board.id}/add-collaborator/', {'username': 'carol'}, format='json'
    )
    assert response.status_code == 403
    assert not board.collaborators.filter(username='carol').exists()