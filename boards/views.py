from rest_framework import viewsets
from .models import Board, List, Card
from .serializers import BoardSerializer, ListSerializer, CardSerializer
from rest_framework import generics, viewsets, permissions 
from .serializers import RegisterSerializer
from django.contrib.auth.models import User



class BoardViewSet(viewsets.ModelViewSet):
    serializer_class = BoardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Board.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ListViewSet(viewsets.ModelViewSet):
    serializer_class = ListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return List.objects.filter(board__owner=self.request.user)


class CardViewSet(viewsets.ModelViewSet):
    serializer_class = CardSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Card.objects.filter(list__board__owner=self.request.user)

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]