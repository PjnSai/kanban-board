import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from boards.models import Board, List, Card


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def alice(db):
    return User.objects.create_user(username='alice', email='alice@example.com', password='testpass123')


@pytest.fixture
def bob(db):
    return User.objects.create_user(username='bob', email='bob@example.com', password='testpass123')


def authenticate(client, user):
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


@pytest.mark.django_db
def test_owner_can_create_card(api_client, alice):
    board = Board.objects.create(name='B', owner=alice)
    lst = List.objects.create(board=board, name='To do', position=0)

    authenticate(api_client, alice)
    response = api_client.post('/api/cards/', {'list': lst.id, 'title': 'Task', 'position': 0}, format='json')

    assert response.status_code == 201
    assert Card.objects.filter(list=lst, title='Task').exists()


@pytest.mark.django_db
def test_user_cannot_create_card_in_others_list(api_client, alice, bob):
    board = Board.objects.create(name='B', owner=alice)
    lst = List.objects.create(board=board, name='To do', position=0)

    authenticate(api_client, bob)
    response = api_client.post('/api/cards/', {'list': lst.id, 'title': 'Sneaky', 'position': 0}, format='json')

    assert response.status_code == 400
    assert not Card.objects.filter(title='Sneaky').exists()


@pytest.mark.django_db
def test_user_cannot_move_card_into_others_list(api_client, alice, bob):
    bob_board = Board.objects.create(name="Bob's", owner=bob)
    bob_list = List.objects.create(board=bob_board, name='Mine', position=0)
    alice_board = Board.objects.create(name="Alice's", owner=alice)
    alice_list = List.objects.create(board=alice_board, name='Hers', position=0)
    card = Card.objects.create(list=alice_list, title='Task', position=0)

    authenticate(api_client, alice)
    response = api_client.patch(f'/api/cards/{card.id}/', {'list': bob_list.id, 'position': 0}, format='json')

    assert response.status_code == 400
    card.refresh_from_db()
    assert card.list_id == alice_list.id


@pytest.mark.django_db
def test_user_cannot_see_or_delete_others_cards(api_client, alice, bob):
    board = Board.objects.create(name='B', owner=alice)
    lst = List.objects.create(board=board, name='To do', position=0)
    card = Card.objects.create(list=lst, title='Secret', position=0)

    authenticate(api_client, bob)
    assert api_client.get(f'/api/cards/{card.id}/').status_code == 404
    assert api_client.delete(f'/api/cards/{card.id}/').status_code == 404
    assert Card.objects.filter(id=card.id).exists()


@pytest.mark.django_db
def test_board_detail_includes_its_cards(api_client, alice):
    board = Board.objects.create(name='B', owner=alice)
    lst = List.objects.create(board=board, name='To do', position=0)
    Card.objects.create(list=lst, title='Task', position=0)

    authenticate(api_client, alice)
    response = api_client.get(f'/api/boards/{board.id}/')

    assert response.status_code == 200
    assert response.data['lists'][0]['cards'][0]['title'] == 'Task'


@pytest.mark.django_db
def test_card_description_is_saved_and_returned(api_client, alice):
    board = Board.objects.create(name='B', owner=alice)
    lst = List.objects.create(board=board, name='To do', position=0)

    authenticate(api_client, alice)
    response = api_client.post('/api/cards/', {
        'list': lst.id, 'title': 'Task', 'description': 'Some detail', 'position': 0,
    }, format='json')

    assert response.status_code == 201
    assert response.data['description'] == 'Some detail'