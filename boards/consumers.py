import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core import signing
from django.db.models import Q

from boards.models import Board


@database_sync_to_async
def is_member(user_id, board_id):
    return Board.objects.filter(
        Q(owner_id=user_id) | Q(collaborators=user_id), pk=board_id
    ).exists()


class BoardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.board_id = self.scope['url_route']['kwargs']['board_id']
        self.group_name = f'board_{self.board_id}'
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

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        self.joined = True
        await self.accept()

    async def disconnect(self, close_code):
        if self.joined:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Clients never publish; only the server broadcasts, from the REST views
        return

    async def board_message(self, event):
        await self.send(text_data=json.dumps(event['message']))