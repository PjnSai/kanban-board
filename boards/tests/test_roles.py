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

@pytest.mark.django_db
def test_manager_can_rename_board_but_not_reorder(world):
    board = world['board']
    client = client_for(world['manager'])
    assert client.patch(f'/api/boards/{board.id}/', {'name': 'New name'}, format='json').status_code == 200
    assert client.patch(f'/api/boards/{board.id}/', {'position': 7}, format='json').status_code == 403
    board.refresh_from_db()
    assert board.name == 'New name' and board.position != 7


@pytest.mark.django_db
def test_editors_and_viewers_cannot_rename_board(world):
    for who in ('editor', 'viewer'):
        response = client_for(world[who]).patch(
            f"/api/boards/{world['board'].id}/", {'name': 'Nope'}, format='json'
        )
        assert response.status_code == 403
    world['board'].refresh_from_db()
    assert world['board'].name == 'Shared'


@pytest.mark.django_db
def test_only_the_owner_can_delete_the_board(world):
    for who in ('manager', 'editor', 'viewer'):
        assert client_for(world[who]).delete(f"/api/boards/{world['board'].id}/").status_code == 403
    assert Board.objects.filter(pk=world['board'].pk).exists()
    assert client_for(world['owner']).delete(f"/api/boards/{world['board'].id}/").status_code == 204


@pytest.mark.django_db
def test_removal_rules(world):
    board = world['board']
    other_manager = make_user('manager2')
    add_member(board, other_manager, 'manager')
    url = f'/api/boards/{board.id}/remove-collaborator/'

    assert client_for(world['editor']).post(url, {'username': 'viewer'}, format='json').status_code == 403
    assert client_for(world['viewer']).post(url, {'username': 'editor'}, format='json').status_code == 403

    manager = client_for(world['manager'])
    assert manager.post(url, {'username': 'manager2'}, format='json').status_code == 403
    assert manager.post(url, {'username': 'owner'}, format='json').status_code == 400
    assert board.collaborators.filter(pk=other_manager.pk).exists()

    assert manager.post(url, {'username': 'editor'}, format='json').status_code == 200
    assert manager.post(url, {'username': 'viewer'}, format='json').status_code == 200
    assert not BoardMembership.objects.filter(board=board, user__in=[world['editor'], world['viewer']]).exists()

    assert client_for(world['owner']).post(url, {'username': 'manager2'}, format='json').status_code == 200
    assert not board.collaborators.filter(pk=other_manager.pk).exists()


@pytest.mark.django_db
def test_members_can_leave_but_the_owner_cannot(world):
    board = world['board']
    for who in ('manager', 'editor', 'viewer'):
        response = client_for(world[who]).post(f'/api/boards/{board.id}/leave/')
        assert response.status_code == 200
        assert not BoardMembership.objects.filter(board=board, user=world[who]).exists()
        assert not board.collaborators.filter(pk=world[who].pk).exists()
    assert client_for(world['owner']).post(f'/api/boards/{board.id}/leave/').status_code == 400


@pytest.mark.django_db
def test_every_member_can_see_the_member_list(world):
    board = world['board']
    for who in ('owner', 'manager', 'editor', 'viewer'):
        response = client_for(world[who]).get(f'/api/boards/{board.id}/members/')
        assert response.status_code == 200
        roles = {row['username']: row['role'] for row in response.data}
        assert roles == {'owner': 'owner', 'manager': 'manager', 'editor': 'editor', 'viewer': 'viewer'}
    assert client_for(world['stranger']).get(f'/api/boards/{board.id}/members/').status_code == 404


@pytest.mark.django_db
def test_set_role_rules(world):
    board = world['board']
    url = f'/api/boards/{board.id}/set-role/'

    assert client_for(world['manager']).post(url, {'username': 'editor', 'role': 'viewer'}, format='json').status_code == 403
    assert client_for(world['editor']).post(url, {'username': 'viewer', 'role': 'manager'}, format='json').status_code == 403

    owner = client_for(world['owner'])
    assert owner.post(url, {'username': 'editor', 'role': 'owner'}, format='json').status_code == 400
    assert owner.post(url, {'username': 'stranger', 'role': 'viewer'}, format='json').status_code == 400
    assert owner.post(url, {'username': 'viewer', 'role': 'manager'}, format='json').status_code == 200
    assert get_role(world['viewer'], board) == 'manager'


@pytest.mark.django_db
def test_a_role_change_takes_effect_immediately(world):
    board, card = world['board'], world['card']
    client = client_for(world['editor'])
    assert client.patch(f'/api/cards/{card.id}/', {'title': 'One'}, format='json').status_code == 200

    client_for(world['owner']).post(
        f'/api/boards/{board.id}/set-role/', {'username': 'editor', 'role': 'viewer'}, format='json'
    )
    assert client.patch(f'/api/cards/{card.id}/', {'title': 'Two'}, format='json').status_code == 403


@pytest.mark.django_db
def test_board_payload_includes_my_role(world):
    board = world['board']
    for who in ('owner', 'manager', 'editor', 'viewer'):
        data = client_for(world[who]).get(f'/api/boards/{board.id}/').data
        assert data['my_role'] == who

@pytest.mark.django_db
def test_reorder_saves_everything_in_one_request(world):
    board, first_list, card = world['board'], world['list'], world['card']
    second_list = List.objects.create(board=board, name='Done', position=1)
    other_card = Card.objects.create(list=first_list, title='Other', position=1)

    response = client_for(world['editor']).post(
        f'/api/boards/{board.id}/reorder/',
        {
            'lists': [second_list.id, first_list.id],
            'cards': [
                {'list': second_list.id, 'cards': [card.id]},
                {'list': first_list.id, 'cards': [other_card.id]},
            ],
        },
        format='json',
    )

    assert response.status_code == 200
    for obj in (first_list, second_list, card, other_card):
        obj.refresh_from_db()
    assert (second_list.position, first_list.position) == (0, 1)
    assert (card.list_id, card.position) == (second_list.id, 0)
    assert (other_card.list_id, other_card.position) == (first_list.id, 0)


@pytest.mark.django_db
def test_reorder_permissions_and_validation(world):
    board, lst, card = world['board'], world['list'], world['card']
    url = f'/api/boards/{board.id}/reorder/'
    body = {'lists': [lst.id], 'cards': [{'list': lst.id, 'cards': [card.id]}]}

    assert client_for(world['viewer']).post(url, body, format='json').status_code == 403
    assert client_for(world['stranger']).post(url, body, format='json').status_code == 404

    stranger_board = Board.objects.create(name='Other', owner=world['stranger'])
    foreign_list = List.objects.create(board=stranger_board, name='X', position=0)
    foreign_card = Card.objects.create(list=foreign_list, title='X', position=0)
    editor = client_for(world['editor'])
    assert editor.post(url, {'lists': [foreign_list.id], 'cards': []}, format='json').status_code == 400
    assert editor.post(url, {'lists': [lst.id], 'cards': [{'list': lst.id, 'cards': [foreign_card.id]}]}, format='json').status_code == 400
    assert editor.post(url, {'lists': [lst.id], 'cards': [{'list': lst.id, 'cards': [card.id, card.id]}]}, format='json').status_code == 400
    assert editor.post(url, {'lists': 'nope', 'cards': []}, format='json').status_code == 400

    foreign_card.refresh_from_db()
    assert foreign_card.list_id == foreign_list.id