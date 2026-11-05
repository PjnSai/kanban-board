from .models import BoardMembership

ROLE_RANK = {'viewer': 1, 'editor': 2, 'manager': 3, 'owner': 4}


def get_role(user, board):
    """The user's role on a board: 'owner', 'manager', 'editor', 'viewer' or None."""
    if board.owner_id == user.id:
        return 'owner'
    role = (
        BoardMembership.objects.filter(board=board, user=user)
        .values_list('role', flat=True)
        .first()
    )
    if role:
        return role
    # A collaborator with no membership row keeps today's behaviour: editor
    if board.collaborators.filter(pk=user.pk).exists():
        return 'editor'
    return None


def has_role(user, board, minimum):
    role = get_role(user, board)
    return role is not None and ROLE_RANK[role] >= ROLE_RANK[minimum]