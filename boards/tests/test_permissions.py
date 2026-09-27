import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from boards.models import Board, List


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_alice(db):
    return User.objects.create_user(username='alice', password='testpass123')


@pytest.fixture
def user_bob(db):
    return User.objects.create_user(username='bob', password='testpass123')


def authenticate(api_client, user):
    from rest_framework_simplejwt.tokens import RefreshToken
    token = RefreshToken.for_user(user).access_token
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


@pytest.mark.django_db
def test_unauthenticated_request_rejected(api_client):
    response = api_client.get('/api/boards/')
    assert response.status_code == 401


@pytest.mark.django_db
def test_user_cannot_see_other_users_boards(api_client, user_alice, user_bob):
    Board.objects.create(name="Alice's Board", owner=user_alice)

    authenticate(api_client, user_bob)
    response = api_client.get('/api/boards/')

    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_user_cannot_add_list_to_others_board(api_client, user_alice, user_bob):
    board = Board.objects.create(name="Alice's Board", owner=user_alice)

    authenticate(api_client, user_bob)
    response = api_client.post('/api/lists/', {
        'board': board.id,
        'name': 'Sneaky List',
        'position': 0,
    })

    assert response.status_code == 400


@pytest.mark.django_db
def test_owner_can_add_list_to_own_board(api_client, user_alice):
    board = Board.objects.create(name="Alice's Board", owner=user_alice)

    authenticate(api_client, user_alice)
    response = api_client.post('/api/lists/', {
        'board': board.id,
        'name': 'To Do',
        'position': 0,
    })

    assert response.status_code == 201
    assert List.objects.filter(board=board, name='To Do').exists()


@pytest.mark.django_db
def test_collaborator_can_add_list_to_shared_board(api_client, user_alice, user_bob):
    board = Board.objects.create(name="Alice's Board", owner=user_alice)
    board.collaborators.add(user_bob)

    authenticate(api_client, user_bob)
    response = api_client.post('/api/lists/', {
        'board': board.id,
        'name': 'Bob\'s List',
        'position': 0,
    })

    assert response.status_code == 201


@pytest.mark.django_db
def test_only_owner_can_delete_board(api_client, user_alice, user_bob):
    board = Board.objects.create(name="Alice's Board", owner=user_alice)
    board.collaborators.add(user_bob)

    authenticate(api_client, user_bob)
    response = api_client.delete(f'/api/boards/{board.id}/')

    assert response.status_code == 403
    assert Board.objects.filter(id=board.id).exists()