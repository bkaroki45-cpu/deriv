from django.shortcuts import render

# Create your views here.
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .services import register_user, login_user
from .serializers import UserSerializer


class RegisterView(APIView):
    def post(self, request):
        data = request.data
        user = register_user(
            username=data.get("username"),
            email=data.get("email"),
            password=data.get("password")
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    def post(self, request):
        data = request.data
        user = login_user(
            username=data.get("username"),
            password=data.get("password")
        )

        if user:
            return Response(UserSerializer(user).data)
        return Response({"error": "Invalid credentials"}, status=400)