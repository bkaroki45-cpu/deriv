from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'phone',
            'country',
            'preferred_currency',
            'dark_mode',
            'language',
            'deriv_connected',
        ]