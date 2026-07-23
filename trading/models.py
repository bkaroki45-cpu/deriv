from django.db import models

from django.conf import settings
from django.core.validators import MinValueValidator


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


class AutomationBot(models.Model):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    enabled = models.BooleanField(default=False, help_text="Only enabled bots can be used by customers.")
    demo_only = models.BooleanField(default=True, editable=False)
    max_stake = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Optional administrator ceiling. Leave blank to let users choose their stake.")
    max_daily_loss = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Optional administrator ceiling. Leave blank for no daily loss cap.")
    max_trades_per_day = models.PositiveIntegerField(null=True, blank=True, help_text="Optional administrator ceiling. Leave blank for no daily trade cap.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self): return self.name


class AutomationRun(models.Model):
    STATUS = [("stopped", "Stopped"), ("running", "Running"), ("stopping", "Stopping"), ("error", "Error")]
    STRATEGIES = [("over_2", "Over 2"), ("under_7", "Under 7")]
    bot = models.ForeignKey(AutomationBot, on_delete=models.PROTECT, related_name="runs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="automation_runs")
    account = models.ForeignKey("accounts.DerivAccount", on_delete=models.PROTECT)
    symbols = models.JSONField(default=list)
    strategy = models.CharField(max_length=12, choices=STRATEGIES, default="over_2")
    tick_window = models.PositiveIntegerField(default=100)
    digit_threshold = models.DecimalField(max_digits=5, decimal_places=2, default=8)
    stake = models.DecimalField(max_digits=12, decimal_places=2, default="0.35", validators=[MinValueValidator("0.35")])
    max_daily_loss = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Optional user limit; leave blank to run until stopped.")
    max_trades_per_day = models.PositiveIntegerField(null=True, blank=True, help_text="Optional user limit; leave blank to run until stopped.")
    status = models.CharField(max_length=12, choices=STATUS, default="stopped")
    selected_symbol = models.CharField(max_length=32, blank=True)
    waiting_for = models.CharField(max_length=32, blank=True)
    active_contract_id = models.CharField(max_length=64, blank=True)
    stats = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta: constraints = [models.UniqueConstraint(fields=["user", "bot"], name="one_run_per_user_bot")]


class AutomationTrade(models.Model):
    run = models.ForeignKey(AutomationRun, on_delete=models.CASCADE, related_name="trades")
    symbol = models.CharField(max_length=32)
    strategy = models.CharField(max_length=12)
    trigger_digit = models.PositiveSmallIntegerField()
    contract_id = models.CharField(max_length=64, unique=True)
    contract_type = models.CharField(max_length=24)
    stake = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=16, default="open")
    profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    opened_at = models.DateTimeField(auto_now_add=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    raw = models.JSONField(default=dict, blank=True)
