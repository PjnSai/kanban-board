import pytest
from django.contrib.auth.models import User
from boards.models import Board, List, Card


@pytest.mark.django_db
def test_create_board():
    user = User.objects.create_user(username='alice', password='testpass123')
    board = Board.objects.create(name='My Board', owner=user)
    assert board.name == 'My Board'
    assert board.owner == user
    assert board.collaborators.count() == 0


@pytest.mark.django_db
def test_board_cascades_to_lists_and_cards():
    user = User.objects.create_user(username='bob', password='testpass123')
    board = Board.objects.create(name='Test Board', owner=user)
    list_obj = List.objects.create(board=board, name='To Do', position=0)
    Card.objects.create(list=list_obj, title='Task 1', position=0)

    assert board.lists.count() == 1
    assert list_obj.cards.count() == 1

    board.delete()
    assert List.objects.filter(id=list_obj.id).count() == 0