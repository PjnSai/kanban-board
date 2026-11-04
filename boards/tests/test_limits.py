import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from boards import serializers as board_serializers
from boards.models import Board, List, Card


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@pytest.fixture
def client_alice(db):
    user = User.objects.create_user(username='alice', email='a@example.com', password='testpass123')
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client, user


@pytest.mark.django_db
def test_board_cap(client_alice, monkeypatch):
    client, user = client_alice
    monkeypatch.setattr(board_serializers, 'MAX_BOARDS_PER_USER', 2)
    Board.objects.create(name='One', owner=user)
    Board.objects.create(name='Two', owner=user)

    response = client.post('/api/boards/', {'name': 'Three', 'position': 0}, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_list_cap(client_alice, monkeypatch):
    client, user = client_alice
    monkeypatch.setattr(board_serializers, 'MAX_LISTS_PER_BOARD', 2)
    board = Board.objects.create(name='B', owner=user)
    List.objects.create(board=board, name='A', position=0)
    List.objects.create(board=board, name='B', position=1)

    response = client.post('/api/lists/', {'board': board.id, 'name': 'C', 'position': 2}, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_card_cap_on_create_and_move(client_alice, monkeypatch):
    client, user = client_alice
    monkeypatch.setattr(board_serializers, 'MAX_CARDS_PER_LIST', 2)
    board = Board.objects.create(name='B', owner=user)
    full = List.objects.create(board=board, name='Full', position=0)
    other = List.objects.create(board=board, name='Other', position=1)
    Card.objects.create(list=full, title='1', position=0)
    Card.objects.create(list=full, title='2', position=1)
    loose = Card.objects.create(list=other, title='3', position=0)

    created = client.post('/api/cards/', {'list': full.id, 'title': 'X', 'position': 2}, format='json')
    assert created.status_code == 400

    moved = client.patch(f'/api/cards/{loose.id}/', {'list': full.id, 'position': 0}, format='json')
    assert moved.status_code == 400


@pytest.mark.django_db
def test_reordering_inside_a_full_list_still_works(client_alice, monkeypatch):
    client, user = client_alice
    monkeypatch.setattr(board_serializers, 'MAX_CARDS_PER_LIST', 2)
    board = Board.objects.create(name='B', owner=user)
    full = List.objects.create(board=board, name='Full', position=0)
    first = Card.objects.create(list=full, title='1', position=0)
    Card.objects.create(list=full, title='2', position=1)

    response = client.patch(f'/api/cards/{first.id}/', {'list': full.id, 'position': 1}, format='json')
    assert response.status_code == 200


@pytest.mark.django_db
def test_description_length_limit(client_alice):
    client, user = client_alice
    board = Board.objects.create(name='B', owner=user)
    lst = List.objects.create(board=board, name='L', position=0)
    too_long = 'x' * (board_serializers.MAX_DESCRIPTION_LENGTH + 1)

    response = client.post('/api/cards/', {
        'list': lst.id, 'title': 'T', 'description': too_long, 'position': 0,
    }, format='json')
    assert response.status_code == 400

@pytest.mark.django_db
def test_board_card_cap(client_alice, monkeypatch):
    client, user = client_alice
    monkeypatch.setattr(board_serializers, 'MAX_CARDS_PER_BOARD', 2)
    board = Board.objects.create(name='B', owner=user)
    a = List.objects.create(board=board, name='A', position=0)
    b = List.objects.create(board=board, name='B', position=1)
    Card.objects.create(list=a, title='1', position=0)
    Card.objects.create(list=b, title='2', position=0)

    response = client.post('/api/cards/', {'list': a.id, 'title': 'X', 'position': 1}, format='json')
    assert response.status_code == 400