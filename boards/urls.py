from rest_framework.routers import DefaultRouter
from .views import BoardViewSet, ListViewSet, CardViewSet, RegisterView, LogoutView, DeleteAccountView, PasswordResetRequestView, PasswordResetConfirmView, MeView, ChangeEmailView, ChangePasswordView, WebSocketTicketView
from django.urls import path
from .invitation_views import (
    BoardInvitationsView, MyInvitationsView, InvitationDetailView,
    AcceptInvitationView, DeclineInvitationView, BlocksView, UnblockView,
)
from .notification_views import NotificationsView, MarkReadView, MarkAllReadView, NotificationsTicketView

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
    path('boards/<int:board_id>/ws-ticket/', WebSocketTicketView.as_view(), name='ws-ticket'),
    path('boards/<int:board_id>/invitations/', BoardInvitationsView.as_view(), name='board-invitations'),
    path('invitations/', MyInvitationsView.as_view(), name='my-invitations'),
    path('invitations/<int:pk>/', InvitationDetailView.as_view(), name='invitation-detail'),
    path('invitations/<int:pk>/accept/', AcceptInvitationView.as_view(), name='invitation-accept'),
    path('invitations/<int:pk>/decline/', DeclineInvitationView.as_view(), name='invitation-decline'),
    path('blocks/', BlocksView.as_view(), name='blocks'),
    path('blocks/<str:username>/', UnblockView.as_view(), name='unblock'),
    path('notifications/', NotificationsView.as_view(), name='notifications'),
    path('notifications/read-all/', MarkAllReadView.as_view(), name='notifications-read-all'),
    path('notifications/<int:pk>/read/', MarkReadView.as_view(), name='notification-read'),
    path('notifications/ws-ticket/', NotificationsTicketView.as_view(), name='notifications-ws-ticket'),
]