from django.db import models

# Create your models here.
from django.db import models
from django.conf import settings


class Wallet(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wallet"
    )

    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    equity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    currency = models.CharField(max_length=10, default="USD")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} Wallet"
    

class WalletTransaction(models.Model):

    TYPE_CHOICES = [
        ("profit", "Profit"),
        ("loss", "Loss"),
        ("adjustment", "Adjustment"),
    ]

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name="transactions")

    amount = models.DecimalField(max_digits=12, decimal_places=2)

    type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    description = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
