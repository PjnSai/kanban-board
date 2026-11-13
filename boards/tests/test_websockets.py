import asyncio

import pytest
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.core import signing
from django.db import connections

from boards.models import Board
from boards.routing import websocket_urlpatterns

application = URLRouter(websocket_urlpatterns)


@pytest.fixture(autouse=True)
def in_memory_channel_layer(settings):
    # Tests must never talk to the real Redis
    settings.CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


@database_sync_to_async
def close_database_connections():
    connections.close_all()


def run(coroutine):
    async def wrapper():
        try:
            return await coroutine
        finally:
            await close_database_connections()

    return asyncio.run(wrapper())


def make_user(name):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='testpass123')


def board_ticket(user, board):
    return signing.dumps({'user': user.id, 'board': board.id}, salt='ws-ticket')


def user_ticket(user):
    return signing.dumps({'user': user.id}, salt='ws-user-ticket')


def board_socket(board, ticket):
    return WebsocketCommunicator(application, f'/ws/boards/{board.id}/?ticket={ticket}')


def user_socket(ticket):
    return WebsocketCommunicator(application, f'/ws/me/?ticket={ticket}')


async def try_connect(socket):
    result = await socket.connect()
    await socket.disconnect()
    return result


@pytest.mark.django_db(transaction=True)
def test_a_member_can_connect_to_the_board():
    alice = make_user('alice')
    board = Board.objects.create(name='B', owner=alice)

    async def scenario():
        return await try_connect(board_socket(board, board_ticket(alice, board)))

    connected, _ = run(scenario())
    assert connected is True


@pytest.mark.django_db(transaction=True)
def test_connections_without_a_valid_ticket_are_refused():
    alice = make_user('alice')
    board = Board.objects.create(name='B', owner=alice)
    wrong_salt = signing.dumps({'user': alice.id, 'board': board.id}, salt='wrong-salt')

    async def scenario():
        return [await try_connect(board_socket(board, t)) for t in ('', 'garbage', wrong_salt)]

    assert run(scenario()) == [(False, 4401)] * 3


@pytest.mark.django_db(transaction=True)
def test_non_members_and_wrong_boards_are_refused():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='Board', owner=alice)
    other = Board.objects.create(name='Other', owner=alice)

    async def scenario():
        stranger = await try_connect(board_socket(board, board_ticket(bob, board)))
        wrong_board = await try_connect(board_socket(other, board_ticket(alice, board)))
        return stranger, wrong_board

    assert run(scenario()) == ((False, 4403), (False, 4403))


@pytest.mark.django_db(transaction=True)
def test_an_expired_ticket_is_refused(monkeypatch):
    alice = make_user('alice')
    board = Board.objects.create(name='B', owner=alice)
    ticket = board_ticket(alice, board)

    real_loads = signing.loads
    monkeypatch.setattr(
        signing, 'loads', lambda value, **kwargs: real_loads(value, **{**kwargs, 'max_age': -1})
    )

    async def scenario():
        return await try_connect(board_socket(board, ticket))

    assert run(scenario()) == (False, 4401)


@pytest.mark.django_db(transaction=True)
def test_the_user_channel_needs_its_own_ticket_and_relays_notifications():
    alice = make_user('alice')
    board = Board.objects.create(name='B', owner=alice)

    async def scenario():
        refused = await try_connect(user_socket(board_ticket(alice, board)))
        socket = user_socket(user_ticket(alice))
        connected, _ = await socket.connect()
        await get_channel_layer().group_send(
            f'user_{alice.id}',
            {'type': 'user_message', 'message': {'event': 'notification', 'id': 1}},
        )
        message = await socket.receive_json_from()
        await socket.disconnect()
        return refused, connected, message

    refused, connected, message = run(scenario())
    assert refused == (False, 4401)
    assert connected is True
    assert message == {'event': 'notification', 'id': 1}


@pytest.mark.django_db(transaction=True)
def test_server_broadcasts_reach_members_but_clients_cannot_publish():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='B', owner=alice)
    board.collaborators.add(bob)

    async def scenario():
        first = board_socket(board, board_ticket(alice, board))
        second = board_socket(board, board_ticket(bob, board))
        await first.connect()
        await second.connect()

        await get_channel_layer().group_send(
            f'board_{board.id}',
            {'type': 'board_message', 'message': {'event': 'card_created'}},
        )
        got_first = await first.receive_json_from()
        got_second = await second.receive_json_from()

        await first.send_json_to({'event': 'card_created', 'title': 'fake'})
        quiet = await second.receive_nothing(timeout=0.3)

        await first.disconnect()
        await second.disconnect()
        return got_first, got_second, quiet

    got_first, got_second, quiet = run(scenario())
    assert got_first == got_second == {'event': 'card_created'}
    assert quiet is True


@pytest.mark.django_db(transaction=True)
def test_removal_and_password_change_close_the_board_connection():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='B', owner=alice)
    board.collaborators.add(bob)

    async def scenario():
        outcomes = []
        for group in (f'board_{board.id}_user_{bob.id}', f'user_{bob.id}'):
            socket = board_socket(board, board_ticket(bob, board))
            await socket.connect()
            await get_channel_layer().group_send(group, {'type': 'force_close'})
            message = await socket.receive_json_from()
            closed = await socket.receive_output()
            await socket.disconnect()
            outcomes.append((message, closed['type']))
        return outcomes

    assert run(scenario()) == [({'event': 'access_revoked'}, 'websocket.close')] * 2