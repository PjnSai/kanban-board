from django.db import models
from django.contrib.auth.models import User
from django.db.models import Q

class Board(models.Model):
    name = models.CharField(max_length=200)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='boards')
    collaborators = models.ManyToManyField(User, related_name='shared_boards', blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position']

    def __str__(self):
        return self.name


class List(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='lists')
    name = models.CharField(max_length=200)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position']

    def __str__(self):
        return f"{self.board.name} - {self.name}"


class Card(models.Model):
    list = models.ForeignKey(List, on_delete=models.CASCADE, related_name='cards')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position']

    def __str__(self):
        return self.title

class BoardMembership(models.Model):
    class Role(models.TextChoices):
        VIEWER = 'viewer', 'Viewer'
        EDITOR = 'editor', 'Editor'
        MANAGER = 'manager', 'Manager'

    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='board_memberships')
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.EDITOR)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['board', 'user'], name='unique_member_per_board'),
        ]

    def __str__(self):
        return f'{self.user} on {self.board} ({self.role})'

class Invitation(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        DECLINED = 'declined', 'Declined'
        CANCELLED = 'cancelled', 'Cancelled'

    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='invitations')
    inviter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='invitations_sent')
    invitee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='invitations_received')
    role = models.CharField(max_length=10, choices=BoardMembership.Role.choices, default=BoardMembership.Role.EDITOR)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['board', 'invitee'],
                condition=Q(status='pending'),
                name='one_pending_invite_per_person_per_board',
            ),
        ]

    def __str__(self):
        return f'{self.inviter} invited {self.invitee} to {self.board} ({self.status})'

class UserBlock(models.Model):
    blocker = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocks_made')
    blocked = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocked_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['blocker', 'blocked'], name='unique_block'),
        ]

    def __str__(self):
        return f'{self.blocker} blocked {self.blocked}'

class Notification(models.Model):
    class Kind(models.TextChoices):
        INVITED = 'invited', 'Invited'
        INVITE_CANCELLED = 'invite_cancelled', 'Invitation cancelled'
        INVITE_ACCEPTED = 'invite_accepted', 'Invitation accepted'
        ADDED = 'added', 'Added to a board'
        REMOVED = 'removed', 'Removed from a board'
        ROLE_CHANGED = 'role_changed', 'Role changed'
        BOARD_DELETED = 'board_deleted', 'Board deleted'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=20, choices=Kind.choices)
    message = models.CharField(max_length=300)
    board_id = models.PositiveIntegerField(null=True, blank=True)  # not a ForeignKey: it must survive the board being deleted
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', '-created_at'])]

    def __str__(self):
        return f'{self.user}: {self.message}'