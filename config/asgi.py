import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django_asgi_app = get_asgi_application()

from django.conf import settings
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import OriginValidator
import boards.routing

allowed_origins = settings.CORS_ALLOWED_ORIGINS
if isinstance(allowed_origins, str):
    allowed_origins = allowed_origins.split(',')
allowed_origins = [o.strip() for o in allowed_origins if o.strip()]

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': OriginValidator(
        AuthMiddlewareStack(
            URLRouter(boards.routing.websocket_urlpatterns)
        ),
        allowed_origins,
    ),
})