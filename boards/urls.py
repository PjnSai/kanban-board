from rest_framework.routers import DefaultRouter
from .views import BoardViewSet, ListViewSet, CardViewSet, RegisterView
from django.urls import path
from .views import LogoutView
from .views import DeleteAccountView
from .views import PasswordResetRequestView, PasswordResetConfirmView

router = DefaultRouter()
router.register(r'boards', BoardViewSet, basename='board')
router.register(r'lists', ListViewSet, basename='list')
router.register(r'cards', CardViewSet, basename='card')


urlpatterns = router.urls + [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/delete-account/', DeleteAccountView.as_view(), name='delete-account'),
    path('auth/password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('auth/password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
]