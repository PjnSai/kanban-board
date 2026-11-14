import pytest


@pytest.fixture(autouse=True)
def fast_test_settings(settings):
    # Cheap password hashing: the default hasher is deliberately slow
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
    # Tests must never talk to the real Redis
    settings.CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}