from rest_framework import serializers
from .models import Board, List, Card
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password


class CardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = ['id', 'list', 'title', 'description', 'position', 'created_at']

    def validate_list(self, value):
        request = self.context['request']
        board = value.board
        if board.owner != request.user and request.user not in board.collaborators.all():
            raise serializers.ValidationError("You don't have permission to add cards to this list.")
        return value


class ListSerializer(serializers.ModelSerializer):
    cards = CardSerializer(many=True, read_only=True)

    class Meta:
        model = List
        fields = ['id', 'board', 'name', 'position', 'cards']

    def validate_board(self, value):
        request = self.context['request']
        if value.owner != request.user and request.user not in value.collaborators.all():
            raise serializers.ValidationError("You don't have permission to add lists to this board.")
        return value


class BoardSerializer(serializers.ModelSerializer):
    lists = ListSerializer(many=True, read_only=True)
    collaborators = serializers.SlugRelatedField(many=True, read_only=True, slug_field='username')
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = ['id', 'name', 'owner', 'position', 'created_at', 'lists', 'collaborators', 'is_owner']
        read_only_fields = ['owner']

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return request and obj.owner == request.user

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

class CollaboratorSerializer(serializers.Serializer):
    username = serializers.CharField()

    def validate_username(self, value):
        try:
            user = User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that username exists.")
        return user
