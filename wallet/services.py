from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction

from .models import Wallet, WalletTransaction


MONEY_QUANT = Decimal("0.01")


def money(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Amount must be a valid number") from exc
    if amount <= 0:
        raise ValueError("Amount must be greater than 0")
    return amount.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def get_wallet(user):
    wallet, _ = Wallet.objects.get_or_create(
        user=user,
        defaults={"currency": getattr(user, "preferred_currency", "USD") or "USD"},
    )
    return wallet


def apply_trade_profit(user_or_wallet, trade):
    """Apply trade profit/loss to wallet. Accepts User or Wallet instance."""
    wallet = get_wallet(user_or_wallet) if hasattr(user_or_wallet, "is_authenticated") else user_or_wallet
    profit = Decimal(str(trade.profit or 0)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    description = f"Trade {trade.id}"

    with transaction.atomic():
        wallet = Wallet.objects.select_for_update().get(pk=wallet.pk)
        existing = WalletTransaction.objects.filter(
            wallet=wallet,
            description=description,
            type__in=["profit", "loss"],
        ).first()
        if existing:
            return existing

        wallet.balance = (wallet.balance + profit).quantize(MONEY_QUANT)
        wallet.equity = (wallet.equity + profit).quantize(MONEY_QUANT)
        wallet.save(update_fields=["balance", "equity", "updated_at"])

        return WalletTransaction.objects.create(
            wallet=wallet,
            amount=abs(profit),
            type="profit" if profit >= 0 else "loss",
            description=description,
        )
