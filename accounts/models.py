from django.db import models

# Create your models here.
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)

    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)

    country = models.CharField(max_length=100, blank=True, null=True)

    profile_picture = models.ImageField(upload_to='profiles/', null=True, blank=True)

    preferred_currency = models.CharField(max_length=10, default="USD")

    dark_mode = models.BooleanField(default=True)

    language = models.CharField(max_length=10, default="en")

    is_phone_verified = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)

    deriv_connected = models.BooleanField(default=False)

    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    def __str__(self):
        return self.username