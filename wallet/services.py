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


def apply_trade_profit(wallet, trade):
    wallet.balance += trade.profit
    wallet.save()

    WalletTransaction.objects.create(
        wallet=wallet,
        amount=trade.profit,
        type="profit" if trade.profit > 0 else "loss",
        description=f"Trade {trade.id}"
    )