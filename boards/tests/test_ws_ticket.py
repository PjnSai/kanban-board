import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from boards.models import Board


def client_for(user=None):
    client = APIClient()
    if user:
        token = RefreshToken.for_user(user).access_token
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


@pytest.fixture
def alice(db):
    return User.objects.create_user(username='alice', email='a@example.com', password='testpass123')


@pytest.fixture
def bob(db):
    return User.objects.create_user(username='bob', email='b@example.com', password='testpass123')


@pytest.mark.django_db
def test_owner_and_collaborator_get_ticket(alice, bob):
    board = Board.objects.create(name='B', owner=alice)
    board.collaborators.add(bob)
    for user in (alice, bob):
        response = client_for(user).get(f'/api/boards/{board.id}/ws-ticket/')
        assert response.status_code == 200
        assert response.data['ticket']


@pytest.mark.django_db
def test_non_member_gets_404(alice, bob):
    board = Board.objects.create(name='B', owner=alice)
    response = client_for(bob).get(f'/api/boards/{board.id}/ws-ticket/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_ticket_requires_login(alice):
    board = Board.objects.create(name='B', owner=alice)
    response = client_for().get(f'/api/boards/{board.id}/ws-ticket/')
    assert response.status_code == 401