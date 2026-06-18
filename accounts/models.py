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


class DerivAccount(models.Model):
    ACCOUNT_TYPES = [
        ("demo", "Demo"),
        ("real", "Real"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="deriv_accounts")
    account_id = models.CharField(max_length=64, db_index=True)
    account_type = models.CharField(max_length=10, choices=ACCOUNT_TYPES)
    currency = models.CharField(max_length=10, default="USD")
    balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    is_active = models.BooleanField(default=False)
    raw = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "account_id")
        ordering = ["-is_active", "account_type", "account_id"]

    def __str__(self):
        return f"{self.user} {self.account_id}"


class OAuthToken(models.Model):
    TOKEN_TYPES = [
        ("oauth", "OAuth"),
        ("pat", "Personal access token"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="deriv_tokens")
    token_type = models.CharField(max_length=10, choices=TOKEN_TYPES, default="oauth")
    access_token = models.TextField()
    refresh_token = models.TextField(blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.CharField(max_length=255, blank=True)
    active_account = models.ForeignKey(DerivAccount, null=True, blank=True, on_delete=models.SET_NULL)
    is_valid = models.BooleanField(default=True)
    last_validated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} {self.token_type}"


class Referral(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="referrals")
    affiliate_token = models.CharField(max_length=120, blank=True)
    utm_source = models.CharField(max_length=120, blank=True)
    utm_campaign = models.CharField(max_length=120, blank=True)
    utm_medium = models.CharField(max_length=80, default="affiliate")
    landing_path = models.CharField(max_length=255, blank=True)
    raw_query = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.utm_campaign or self.affiliate_token or "referral"


class ActivityLog(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="activity_logs")
    action = models.CharField(max_length=120)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.action
