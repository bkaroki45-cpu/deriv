from .models import Wallet, WalletTransaction


def get_wallet(user):
    return Wallet.objects.get(user=user)


def deposit(wallet, amount, description="Deposit"):
    wallet.balance += amount
    wallet.save()

    WalletTransaction.objects.create(
        wallet=wallet,
        amount=amount,
        type="deposit",
        description=description
    )


def withdraw(wallet, amount, description="Withdraw"):

    if wallet.balance < amount:
        raise ValueError("Insufficient balance")

    wallet.balance -= amount
    wallet.save()

    WalletTransaction.objects.create(
        wallet=wallet,
        amount=amount,
        type="withdraw",
        description=description
    )


def apply_trade_profit(user_or_wallet, trade):
    """Apply trade profit/loss to wallet. Accepts User or Wallet instance."""
    if hasattr(user_or_wallet, "wallet"):
        wallet = user_or_wallet.wallet
    else:
        wallet = user_or_wallet
    wallet.balance += trade.profit
    wallet.save()

    WalletTransaction.objects.create(
        wallet=wallet,
        amount=trade.profit,
        type="profit" if trade.profit > 0 else "loss",
        description=f"Trade {trade.id}"
    )
