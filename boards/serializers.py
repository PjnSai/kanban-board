from rest_framework import serializers
from .models import Board, List, Card
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .roles import has_role, get_role


MAX_BOARDS_PER_USER = 10
MAX_LISTS_PER_BOARD = 10
MAX_CARDS_PER_LIST = 40
MAX_CARDS_PER_BOARD = 200
MAX_DESCRIPTION_LENGTH = 1000


class CardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = ['id', 'list', 'title', 'description', 'position', 'created_at']
        extra_kwargs = {'description': {'max_length': MAX_DESCRIPTION_LENGTH}}

    def validate_list(self, value):
        request = self.context['request']
        board = value.board
        if not has_role(request.user, board, 'editor'):
            raise serializers.ValidationError("You don't have permission to add cards to this list.")
        new_to_list = self.instance is None or self.instance.list_id != value.id
        if new_to_list and value.cards.count() >= MAX_CARDS_PER_LIST:
            raise serializers.ValidationError(f"A list can hold at most {MAX_CARDS_PER_LIST} cards.")
        new_to_board = self.instance is None or self.instance.list.board_id != board.id
        if new_to_board and Card.objects.filter(list__board=board).count() >= MAX_CARDS_PER_BOARD:
            raise serializers.ValidationError(f"A board can hold at most {MAX_CARDS_PER_BOARD} cards.")
        return value

class ListSerializer(serializers.ModelSerializer):
    cards = CardSerializer(many=True, read_only=True)

    class Meta:
        model = List
        fields = ['id', 'board', 'name', 'position', 'cards']

    def validate_board(self, value):
        request = self.context['request']
        if not has_role(request.user, value, 'editor'):
            raise serializers.ValidationError("You don't have permission to add lists to this board.")
        new_to_board = self.instance is None or self.instance.board_id != value.id
        if new_to_board and value.lists.count() >= MAX_LISTS_PER_BOARD:
            raise serializers.ValidationError(f"A board can hold at most {MAX_LISTS_PER_BOARD} lists.")
        return value


class BoardSerializer(serializers.ModelSerializer):
    lists = ListSerializer(many=True, read_only=True)
    collaborators = serializers.SlugRelatedField(many=True, read_only=True, slug_field='username')
    is_owner = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = ['id', 'name', 'owner', 'position', 'created_at', 'lists', 'collaborators', 'is_owner', 'my_role']
        read_only_fields = ['owner']

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return request and obj.owner == request.user

    def get_my_role(self, obj):
        request = self.context.get('request')
        return get_role(request.user, obj) if request else None

    def validate(self, attrs):
        request = self.context.get('request')
        if (
            self.instance is None
            and request
            and Board.objects.filter(owner=request.user).count() >= MAX_BOARDS_PER_USER
        ):
            raise serializers.ValidationError(f"You can own at most {MAX_BOARDS_PER_USER} boards.")
        return attrs

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['username', 'email', 'password']
        extra_kwargs = {'email': {'required': True, 'allow_blank': False}}

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with that username already exists.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
        )

class CollaboratorSerializer(serializers.Serializer):
    username = serializers.CharField()

    def validate_username(self, value):
        try:
            user = User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that username exists.")
        return user
