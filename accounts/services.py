from django.contrib.auth import authenticate
from .models import User


def register_user(username, email, password):
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )
    return user


def login_user(username, password):
    user = authenticate(username=username, password=password)
    return user