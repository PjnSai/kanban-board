from rest_framework import serializers
from .models import Board, List, Card
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password


class CardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = ['id', 'list', 'title', 'description', 'position', 'created_at']


class ListSerializer(serializers.ModelSerializer):
    cards = CardSerializer(many=True, read_only=True)

    class Meta:
        model = List
        fields = ['id', 'board', 'name', 'position', 'cards']


class BoardSerializer(serializers.ModelSerializer):
    lists = ListSerializer(many=True, read_only=True)

    class Meta:
        model = Board
        fields = ['id', 'name', 'owner', 'created_at', 'lists']

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
        )
        return user        