import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from boards.models import Board, BoardMembership, List, Card
from boards.roles import get_role, has_role


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


def add_member(board, user, role):
    board.collaborators.add(user)
    BoardMembership.objects.create(board=board, user=user, role=role)


@pytest.fixture
def world(db):
    users = {n: make_user(n) for n in ['owner', 'manager', 'editor', 'viewer', 'stranger']}
    board = Board.objects.create(name='Shared', owner=users['owner'])
    add_member(board, users['manager'], 'manager')
    add_member(board, users['editor'], 'editor')
    add_member(board, users['viewer'], 'viewer')
    lst = List.objects.create(board=board, name='To do', position=0)
    card = Card.objects.create(list=lst, title='Task', position=0)
    return {**users, 'board': board, 'list': lst, 'card': card}


@pytest.mark.django_db
def test_get_role(world):
    board = world['board']
    assert get_role(world['owner'], board) == 'owner'
    assert get_role(world['manager'], board) == 'manager'
    assert get_role(world['editor'], board) == 'editor'
    assert get_role(world['viewer'], board) == 'viewer'
    assert get_role(world['stranger'], board) is None

    legacy = make_user('legacy')
    board.collaborators.add(legacy)  # no membership row
    assert get_role(legacy, board) == 'editor'
    assert has_role(world['viewer'], board, 'viewer')
    assert not has_role(world['viewer'], board, 'editor')


@pytest.mark.django_db
def test_viewer_can_read(world):
    client = client_for(world['viewer'])
    assert client.get(f"/api/boards/{world['board'].id}/").status_code == 200
    assert client.get(f"/api/lists/{world['list'].id}/").status_code == 200
    assert client.get(f"/api/cards/{world['card'].id}/").status_code == 200


@pytest.mark.django_db
def test_viewer_cannot_change_lists_or_cards(world):
    client = client_for(world['viewer'])
    lst, card, board = world['list'], world['card'], world['board']

    assert client.post('/api/lists/', {'board': board.id, 'name': 'X', 'position': 1}, format='json').status_code == 400
    assert client.post('/api/cards/', {'list': lst.id, 'title': 'X', 'position': 1}, format='json').status_code == 400
    assert client.patch(f'/api/lists/{lst.id}/', {'name': 'Renamed'}, format='json').status_code == 403
    assert client.patch(f'/api/cards/{card.id}/', {'title': 'Renamed'}, format='json').status_code == 403
    assert client.delete(f'/api/cards/{card.id}/').status_code == 403
    assert client.delete(f'/api/lists/{lst.id}/').status_code == 403

    lst.refresh_from_db()
    card.refresh_from_db()
    assert lst.name == 'To do' and card.title == 'Task'
    assert board.lists.count() == 1 and Card.objects.filter(list=lst).count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize('who', ['editor', 'manager', 'owner'])
def test_editors_and_above_can_change_lists_and_cards(world, who):
    client = client_for(world[who])
    lst, card, board = world['list'], world['card'], world['board']

    created = client.post('/api/cards/', {'list': lst.id, 'title': 'New', 'position': 1}, format='json')
    assert created.status_code == 201
    assert client.patch(f'/api/cards/{card.id}/', {'title': 'Edited'}, format='json').status_code == 200
    assert client.patch(f'/api/lists/{lst.id}/', {'name': 'Edited'}, format='json').status_code == 200
    assert client.post('/api/lists/', {'board': board.id, 'name': 'Second', 'position': 1}, format='json').status_code == 201
    assert client.delete(f"/api/cards/{created.data['id']}/").status_code == 204


@pytest.mark.django_db
def test_cannot_move_a_card_into_a_board_where_you_are_only_a_viewer(world):
    other_board = Board.objects.create(name='Other', owner=make_user('other'))
    add_member(other_board, world['editor'], 'viewer')
    other_list = List.objects.create(board=other_board, name='L', position=0)

    response = client_for(world['editor']).patch(
        f"/api/cards/{world['card'].id}/", {'list': other_list.id, 'position': 0}, format='json'
    )
    assert response.status_code == 400
    world['card'].refresh_from_db()
    assert world['card'].list_id == world['list'].id


@pytest.mark.django_db
def test_stranger_sees_nothing(world):
    client = client_for(world['stranger'])
    assert client.get(f"/api/lists/{world['list'].id}/").status_code == 404
    assert client.get(f"/api/cards/{world['card'].id}/").status_code == 404