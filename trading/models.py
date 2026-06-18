from django.db import models

from django.conf import settings


class Transaction(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deriv_transactions")
    account_id = models.CharField(max_length=64, blank=True)
    transaction_id = models.CharField(max_length=120, blank=True, db_index=True)
    action = models.CharField(max_length=80, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="USD")
    raw = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Portfolio(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deriv_portfolios")
    account_id = models.CharField(max_length=64, db_index=True)
    contract_id = models.CharField(max_length=120, db_index=True)
    symbol = models.CharField(max_length=40, blank=True)
    contract_type = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=40, default="open")
    buy_price = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    current_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    profit = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    raw = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class Commission(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="commissions")
    account_id = models.CharField(max_length=64, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="USD")
    trade_volume = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    period = models.CharField(max_length=40, blank=True)
    raw = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class TradingLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="trading_logs")
    action = models.CharField(max_length=120)
    account_id = models.CharField(max_length=64, blank=True)
    symbol = models.CharField(max_length=40, blank=True)
    contract_id = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=40, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
