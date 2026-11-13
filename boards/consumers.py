import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from django.core import signing
from django.db.models import Q

from boards.models import Board

MAX_USER_CONNECTIONS = 5
MAX_BOARD_CONNECTIONS_PER_USER = 10
CONNECTION_LIMIT_CLOSE_CODE = 4409


class ConnectionLimiter:
    """Keeps at most `limit` open connections per user, closing the oldest first."""

    def __init__(self, limit):
        self.limit = limit
        self._open = {}

    async def add(self, user_id, consumer):
        connections = self._open.setdefault(user_id, [])
        while len(connections) >= self.limit:
            oldest = connections.pop(0)
            try:
                await oldest.close(code=CONNECTION_LIMIT_CLOSE_CODE)
            except Exception:
                pass  # it may already be gone; the slot is free either way
        connections.append(consumer)

    def remove(self, user_id, consumer):
        connections = self._open.get(user_id)
        if not connections:
            return
        if consumer in connections:
            connections.remove(consumer)
        if not connections:
            self._open.pop(user_id, None)

    def count(self, user_id):
        return len(self._open.get(user_id, []))


board_connections = ConnectionLimiter(MAX_BOARD_CONNECTIONS_PER_USER)
user_connections = ConnectionLimiter(MAX_USER_CONNECTIONS)


@database_sync_to_async
def is_member(user_id, board_id):
    return Board.objects.filter(
        Q(owner_id=user_id) | Q(collaborators=user_id), pk=board_id
    ).exists()


@database_sync_to_async
def user_is_active(user_id):
    return User.objects.filter(pk=user_id, is_active=True).exists()


class BoardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.board_id = self.scope['url_route']['kwargs']['board_id']
        self.group_name = f'board_{self.board_id}'
        self.user_group = None
        self.user_id = None
        self.joined = False

        query = parse_qs(self.scope['query_string'].decode())
        ticket = (query.get('ticket') or [''])[0]
        try:
            payload = signing.loads(ticket, salt='ws-ticket', max_age=30)
        except signing.BadSignature:
            await self.close(code=4401)
            return

        if str(payload.get('board')) != str(self.board_id) or not await is_member(
            payload.get('user'), int(self.board_id)
        ):
            await self.close(code=4403)
            return

        self.user_id = payload['user']
        self.user_group = f"board_{self.board_id}_user_{self.user_id}"
        await board_connections.add(self.user_id, self)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        self.joined = True
        await self.accept()

    async def disconnect(self, close_code):
        if self.user_id is not None:
            board_connections.remove(self.user_id, self)
        if self.joined:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Clients never publish; only the server broadcasts, from the REST views
        return

    async def board_message(self, event):
        await self.send(text_data=json.dumps(event['message']))

    async def force_close(self, event):
        # Tell the page why, then close. Sent when the person is removed from the board.
        await self.send(text_data=json.dumps({'event': 'access_revoked'}))
        await self.close(code=4403)


class UserConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = None
        self.user_id = None

        query = parse_qs(self.scope['query_string'].decode())
        ticket = (query.get('ticket') or [''])[0]
        try:
            payload = signing.loads(ticket, salt='ws-user-ticket', max_age=30)
        except signing.BadSignature:
            await self.close(code=4401)
            return

        user_id = payload.get('user')
        if not await user_is_active(user_id):
            await self.close(code=4403)
            return

        self.user_id = user_id
        self.group_name = f'user_{user_id}'
        await user_connections.add(user_id, self)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if self.user_id is not None:
            user_connections.remove(self.user_id, self)
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Clients never publish; the server pushes
        return

    async def user_message(self, event):
        await self.send(text_data=json.dumps(event['message']))

    async def force_close(self, event):
        await self.close(code=4401)