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
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.core.cache import cache
from datetime import date
from rest_framework.throttling import AnonRateThrottle
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
import os
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

DAILY_EMAIL_LIMIT = 300

def _email_quota_exceeded():
    key = f'password_reset_count:{date.today().isoformat()}'
    return cache.get(key, 0) >= DAILY_EMAIL_LIMIT

def _increment_email_quota():
    key = f'password_reset_count:{date.today().isoformat()}'
    cache.set(key, cache.get(key, 0) + 1, timeout=60 * 60 * 26)

def _cooldown_key(email):
    return f'password_reset_cooldown:{email.lower()}'

class PasswordResetThrottle(AnonRateThrottle):
    scope = 'password_reset'


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

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board.id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'collaborator_added',
                    'username': user.username,
                    'origin': request.headers.get('X-Client-Id', ''),
                },
            }
        )
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

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board.id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'collaborator_removed',
                    'username': user.username,
                    'origin': request.headers.get('X-Client-Id', ''),
                },
            }
        )
        return Response({'detail': f'{user.username} removed.'}, status=200)


class ListViewSet(viewsets.ModelViewSet):
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return List.objects.filter(Q(board__owner=user) | Q(board__collaborators=user)).distinct()

    def perform_create(self, serializer):
        list_obj = serializer.save()
        board_id = list_obj.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'list_created',
                    'list_id': list_obj.id,
                    'name': list_obj.name,
                    'position': list_obj.position,
                    'origin': client_id,
                },
            }
        )

    

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
                    'name': list_obj.name,
                    'position': list_obj.position,
                    'origin': client_id,
                },
            }
        )

    def perform_destroy(self, instance):
            board_id = instance.board.id
            list_id = instance.id
            client_id = self.request.headers.get('X-Client-Id', '')
            instance.delete()
    
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'board_{board_id}',
                {
                    'type': 'board_message',
                    'message': {
                        'event': 'list_deleted',
                        'list_id': list_id,
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

    def perform_create(self, serializer):
        card = serializer.save()
        board_id = card.list.board.id
        client_id = self.request.headers.get('X-Client-Id', '')
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'card_created',
                    'card_id': card.id,
                    'list_id': card.list.id,
                    'title': card.title,
                    'position': card.position,
                    'origin': client_id,
                },
            }
        )

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
                    'title': card.title,
                    'position': card.position,
                    'origin': client_id,
                },
            }
        )

    def perform_destroy(self, instance):
        board_id = instance.list.board.id
        card_id = instance.id
        client_id = self.request.headers.get('X-Client-Id', '')
        instance.delete()

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'board_{board_id}',
            {
                'type': 'board_message',
                'message': {
                    'event': 'card_deleted',
                    'card_id': card_id,
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



class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip()
        generic_response = Response(
            {'detail': 'If that email is registered, a reset link has been sent.'},
            status=200
        )

        if not email:
            return generic_response

        if cache.get(_cooldown_key(email)):
            return Response(
                {'detail': 'A reset email was already sent recently. Please check your inbox or wait a minute before trying again.'},
                status=429
            )

        if _email_quota_exceeded():
            return Response(
                {'detail': "We've reached our daily limit for password reset emails. Please try again tomorrow."},
                status=429
            )

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return generic_response

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
        reset_link = f'{frontend_url}/reset-password/{uid}/{token}/'

        plain_message = f'Click the link to reset your password: {reset_link}\n\nIf you did not request this, ignore this email.'
        html_message = f'''
        <p>We received a request to reset your Kanban Board password.</p>
        <p><a href="{reset_link}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Reset your password</a></p>
        <p>Or copy and paste this link into your browser:<br>{reset_link}</p>
        <p style="color:#64748b;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
        '''

        email_message = EmailMultiAlternatives(
            subject='Reset your Kanban Board password',
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        email_message.attach_alternative(html_message, 'text/html')
        email_message.send()

        cache.set(_cooldown_key(email), True, timeout=60)
        _increment_email_quota()
        return generic_response


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')

        if not uid or not token or not new_password:
            return Response({'detail': 'Missing required fields.'}, status=400)

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({'detail': 'Invalid reset link.'}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'This reset link is invalid or has expired.'}, status=400)

        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response({'detail': e.messages}, status=400)

        user.set_password(new_password)
        user.save()
        return Response({'detail': 'Password has been reset successfully.'}, status=200)