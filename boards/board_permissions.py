from rest_framework import permissions

from .models import Card
from .roles import has_role


class EditorOrReadOnly(permissions.BasePermission):
    """Members can read a board's lists and cards; changing them needs editor rights."""
    message = "You don't have permission to change this board."

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        board = obj.list.board if isinstance(obj, Card) else obj.board
        return has_role(request.user, board, 'editor')