from rest_framework.routers import DefaultRouter
from .views import BoardViewSet, ListViewSet, CardViewSet, RegisterView, LogoutView, DeleteAccountView, PasswordResetRequestView, PasswordResetConfirmView, MeView, ChangeEmailView, ChangePasswordView
from django.urls import path
 

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
    path('auth/me/', MeView.as_view(), name='me'),
    path('auth/change-email/', ChangeEmailView.as_view(), name='change-email'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change-password'),
]