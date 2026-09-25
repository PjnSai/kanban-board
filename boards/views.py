from rest_framework import viewsets
from .models import Board, List, Card
from .serializers import BoardSerializer, ListSerializer, CardSerializer
from rest_framework import generics, viewsets, permissions 
from .serializers import RegisterSerializer
from django.contrib.auth.models import User
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import CollaboratorSerializer
from rest_framework.exceptions import PermissionDenied


class BoardViewSet(viewsets.ModelViewSet):
    serializer_class = BoardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Board.objects.filter(Q(owner=user) | Q(collaborators=user)).distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied("Only the board owner can delete this board.")
        instance.delete()


    @action(detail=True, methods=['post'], url_path='add-collaborator')
    def add_collaborator(self, request, pk=None):
        board = self.get_object()
        if board.owner != request.user:
            return Response({'detail': 'Only the owner can add collaborators.'}, status=403)

        serializer = CollaboratorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['username']

        if user == board.owner:
            return Response({'detail': 'Owner is already on the board.'}, status=400)

        board.collaborators.add(user)
        return Response({'detail': f'{user.username} added.'}, status=200)

    @action(detail=True, methods=['post'], url_path='leave')
    def leave(self, request, pk=None):
        board = self.get_object()
        if board.owner == request.user:
            return Response({'detail': 'Owners cannot leave their own board. Delete it instead.'}, status=400)
        board.collaborators.remove(request.user)
        return Response({'detail': 'You have left the board.'}, status=200)

    @action(detail=True, methods=['post'], url_path='remove-collaborator')
    def remove_collaborator(self, request, pk=None):
        board = self.get_object()
        if board.owner != request.user:
            return Response({'detail': 'Only the owner can remove collaborators.'}, status=403)

        serializer = CollaboratorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['username']

        board.collaborators.remove(user)
        return Response({'detail': f'{user.username} removed.'}, status=200)


class ListViewSet(viewsets.ModelViewSet):
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return List.objects.filter(Q(board__owner=user) | Q(board__collaborators=user)).distinct()

    def perform_update(self, serializer):
        list_obj = serializer.save()
        board_id = list_obj.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'list_moved',
                    'list_id': list_obj.id,
                    'position': list_obj.position,
                    'origin': client_id,
                },
            }
        )


class CardViewSet(viewsets.ModelViewSet):
    serializer_class = CardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Card.objects.filter(Q(list__board__owner=user) | Q(list__board__collaborators=user)).distinct()

    def perform_update(self, serializer):
        card = serializer.save()
        board_id = card.list.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'card_moved',
                    'card_id': card.id,
                    'list_id': card.list.id,
                    'position': card.position,
                    'origin': client_id,
                },
            }
        )

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(status=205)
        except Exception:
            return Response(status=400)

class DeleteAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        request.user.delete()
        return Response(status=204)