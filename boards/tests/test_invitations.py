import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from boards.models import Board, Invitation


def make_user(name):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='testpass123')


@pytest.mark.django_db
def test_only_one_pending_invite_per_person_per_board():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='B', owner=alice)
    Invitation.objects.create(board=board, inviter=alice, invitee=bob)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Invitation.objects.create(board=board, inviter=alice, invitee=bob)


@pytest.mark.django_db
def test_can_invite_again_after_a_decline():
    alice, bob = make_user('alice'), make_user('bob')
    board = Board.objects.create(name='B', owner=alice)
    Invitation.objects.create(board=board, inviter=alice, invitee=bob, status=Invitation.Status.DECLINED)
    Invitation.objects.create(board=board, inviter=alice, invitee=bob)
    assert Invitation.objects.filter(board=board, invitee=bob).count() == 2