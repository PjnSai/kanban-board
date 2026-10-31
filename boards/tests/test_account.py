import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from boards.models import Board
from django.conf import settings

STRONG_PASSWORD = 'Str0ng-Pass-9271'


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_alice(db):
    return User.objects.create_user(
        username='alice', email='alice@example.com', password='testpass123'
    )


@pytest.fixture
def user_bob(db):
    return User.objects.create_user(
        username='bob', email='bob@example.com', password='testpass123'
    )


def authenticate(api_client, user):
    token = RefreshToken.for_user(user).access_token
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


# --- /api/auth/me/ ---

@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    response = api_client.get('/api/auth/me/')
    assert response.status_code == 401


@pytest.mark.django_db
def test_me_returns_current_user(api_client, user_alice):
    Board.objects.create(name='One', owner=user_alice)

    authenticate(api_client, user_alice)
    response = api_client.get('/api/auth/me/')

    assert response.status_code == 200
    assert response.data['username'] == 'alice'
    assert response.data['email'] == 'alice@example.com'
    assert response.data['boards_owned'] == 1


# --- change email ---

@pytest.mark.django_db
def test_change_email_rejects_wrong_password(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-email/', {
        'email': 'new@example.com',
        'password': 'wrong-password',
    }, format='json')

    assert response.status_code == 400
    user_alice.refresh_from_db()
    assert user_alice.email == 'alice@example.com'


@pytest.mark.django_db
def test_change_email_rejects_taken_email(api_client, user_alice, user_bob):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-email/', {
        'email': 'BOB@example.com',  # different case on purpose
        'password': 'testpass123',
    }, format='json')

    assert response.status_code == 400
    user_alice.refresh_from_db()
    assert user_alice.email == 'alice@example.com'


@pytest.mark.django_db
def test_change_email_rejects_invalid_email(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-email/', {
        'email': 'not-an-email',
        'password': 'testpass123',
    }, format='json')

    assert response.status_code == 400


@pytest.mark.django_db
def test_change_email_success_saves_lowercase(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-email/', {
        'email': 'NewAddress@Example.com',
        'password': 'testpass123',
    }, format='json')

    assert response.status_code == 200
    user_alice.refresh_from_db()
    assert user_alice.email == 'newaddress@example.com'


# --- change password ---

@pytest.mark.django_db
def test_change_password_rejects_wrong_current_password(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-password/', {
        'current_password': 'wrong-password',
        'new_password': STRONG_PASSWORD,
    }, format='json')

    assert response.status_code == 400
    user_alice.refresh_from_db()
    assert user_alice.check_password('testpass123')


@pytest.mark.django_db
def test_change_password_rejects_weak_password(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-password/', {
        'current_password': 'testpass123',
        'new_password': '123',
    }, format='json')

    assert response.status_code == 400
    user_alice.refresh_from_db()
    assert user_alice.check_password('testpass123')


@pytest.mark.django_db
def test_change_password_rejects_same_password(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.post('/api/auth/change-password/', {
        'current_password': 'testpass123',
        'new_password': 'testpass123',
    }, format='json')

    assert response.status_code == 400


@pytest.mark.django_db
def test_change_password_success_revokes_refresh_tokens(api_client, user_alice):
    refresh = RefreshToken.for_user(user_alice)
    authenticate(api_client, user_alice)

    response = api_client.post('/api/auth/change-password/', {
        'current_password': 'testpass123',
        'new_password': STRONG_PASSWORD,
    }, format='json')

    assert response.status_code == 200
    user_alice.refresh_from_db()
    assert user_alice.check_password(STRONG_PASSWORD)

    # Every refresh token for this user is now blacklisted
    still_valid = OutstandingToken.objects.filter(user=user_alice).exclude(
        blacklistedtoken__isnull=False
    )
    assert still_valid.count() == 0

    # ...and the refresh endpoint refuses the old one
    refresh_response = api_client.post(
        '/api/auth/refresh/', {'refresh': str(refresh)}, format='json'
    )
    assert refresh_response.status_code == 401


# --- delete account ---

@pytest.mark.django_db
def test_delete_account_requires_correct_password(api_client, user_alice):
    authenticate(api_client, user_alice)
    response = api_client.delete(
        '/api/auth/delete-account/', {'password': 'wrong-password'}, format='json'
    )

    assert response.status_code == 400
    assert User.objects.filter(id=user_alice.id).exists()


@pytest.mark.django_db
def test_delete_account_removes_user_and_boards(api_client, user_alice):
    board = Board.objects.create(name='Doomed', owner=user_alice)
    alice_id = user_alice.id

    authenticate(api_client, user_alice)
    response = api_client.delete(
        '/api/auth/delete-account/', {'password': 'testpass123'}, format='json'
    )

    assert response.status_code == 204
    assert not User.objects.filter(id=alice_id).exists()
    assert not Board.objects.filter(id=board.id).exists()


# --- throttling ---

@pytest.mark.django_db
def test_sensitive_endpoints_are_throttled(api_client, user_alice):
    rate = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['account_sensitive']
    limit = int(rate.split('/')[0])

    authenticate(api_client, user_alice)
    payload = {'current_password': 'wrong-password', 'new_password': STRONG_PASSWORD}

    for _ in range(limit):
        response = api_client.post('/api/auth/change-password/', payload, format='json')
        assert response.status_code == 400

    response = api_client.post('/api/auth/change-password/', payload, format='json')
    assert response.status_code == 429


# --- registration ---

@pytest.mark.django_db
def test_register_rejects_duplicate_email(api_client, user_alice):
    response = api_client.post('/api/auth/register/', {
        'username': 'newuser',
        'email': 'ALICE@example.com',
        'password': STRONG_PASSWORD,
    }, format='json')

    assert response.status_code == 400
    assert 'email' in response.data

@pytest.mark.django_db
def test_change_email_notifies_old_address(api_client, user_alice, mailoutbox):
    authenticate(api_client, user_alice)
    api_client.post('/api/auth/change-email/', {
        'email': 'new@example.com',
        'password': 'testpass123',
    }, format='json')

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ['alice@example.com']
    assert 'new@example.com' not in mailoutbox[0].body  # only the masked form


@pytest.mark.django_db
def test_change_password_sends_notice(api_client, user_alice, mailoutbox):
    authenticate(api_client, user_alice)
    api_client.post('/api/auth/change-password/', {
        'current_password': 'testpass123',
        'new_password': STRONG_PASSWORD,
    }, format='json')

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ['alice@example.com']


@pytest.mark.django_db
def test_login_is_throttled_per_username(api_client, user_alice, user_bob):
    # Assumes 'login' is 10/hour in settings
    limit = int(settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['login'].split('/')[0])
    for _ in range(limit):
        response = api_client.post('/api/auth/login/', {
            'username': 'alice', 'password': 'wrong',
        }, format='json')
        assert response.status_code == 401

    response = api_client.post('/api/auth/login/', {
        'username': 'alice', 'password': 'wrong',
    }, format='json')
    assert response.status_code == 429

    # A different username from the same address is unaffected
    response = api_client.post('/api/auth/login/', {
        'username': 'bob', 'password': 'wrong',
    }, format='json')
    assert response.status_code == 401

@pytest.mark.django_db
def test_register_is_throttled(api_client):
    limit = int(settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['register'].split('/')[0])

    for i in range(limit):
        response = api_client.post('/api/auth/register/', {
            'username': f'user{i}',
            'email': f'user{i}@example.com',
            'password': STRONG_PASSWORD,
        }, format='json')
        assert response.status_code == 201

    response = api_client.post('/api/auth/register/', {
        'username': 'one-too-many',
        'email': 'toomany@example.com',
        'password': STRONG_PASSWORD,
    }, format='json')
    assert response.status_code == 429