from django.db import models
from django.conf import settings


class Trade(models.Model):

    # =========================
    # STATUS
    # =========================
    STATUS_CHOICES = [
        ("open", "Open"),
        ("closed", "Closed"),
        ("cancelled", "Cancelled"),
    ]

    # =========================
    # DIRECTION
    # =========================
    DIRECTION_CHOICES = [
        ("rise", "Rise"),
        ("fall", "Fall"),
    ]

    # =========================
    # USER LINK
    # =========================
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trades"
    )

    # =========================
    # MARKET DATA
    # =========================
    symbol = models.CharField(max_length=20)  # e.g. R_100
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)

    # =========================
    # MONEY
    # =========================
    stake = models.DecimalField(max_digits=12, decimal_places=2)

    entry_price = models.DecimalField(
        max_digits=20,
        decimal_places=5,
        null=True,
        blank=True
    )

    exit_price = models.DecimalField(
        max_digits=20,
        decimal_places=5,
        null=True,
        blank=True
    )

    profit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    # =========================
    # RISK MANAGEMENT (NEW)
    # =========================
    stop_loss = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )

    take_profit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )

    # =========================
    # CONTRACT INFO (DERIV)
    # =========================
    contract_id = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )
    contract_type = models.CharField(max_length=40, blank=True)
    duration = models.PositiveIntegerField(null=True, blank=True)
    duration_unit = models.CharField(max_length=10, blank=True)

    # =========================
    # STATUS
    # =========================
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="open"
    )

    # =========================
    # TIMESTAMPS
    # =========================
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    # =========================
    # HELPER METHODS
    # =========================
    def is_open(self):
        return self.status == "open"

    def close(self, exit_price, profit):
        self.exit_price = exit_price
        self.profit = profit
        self.status = "closed"
        self.save()

    def __str__(self):
        return f"{self.user.username} | {self.symbol} | {self.direction} | {self.status}"
