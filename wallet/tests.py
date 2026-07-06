from decimal import Decimal
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import Wallet, WalletTransaction
from .services import apply_trade_profit, get_wallet


class WalletServiceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="wallet-user",
            email="wallet@example.com",
            password="pass12345",
        )
        self.wallet = get_wallet(self.user)

    def test_user_gets_wallet_from_signal(self):
        self.assertTrue(Wallet.objects.filter(user=self.user).exists())
        self.assertEqual(self.wallet.currency, "USD")

    def test_apply_trade_profit_is_idempotent(self):
        trade = SimpleNamespace(id=42, profit=Decimal("4.20"))

        first = apply_trade_profit(self.user, trade)
        second = apply_trade_profit(self.user, trade)
        self.wallet.refresh_from_db()

        self.assertEqual(first.id, second.id)
        self.assertEqual(self.wallet.balance, Decimal("4.20"))
        self.assertEqual(self.wallet.equity, Decimal("4.20"))
        self.assertEqual(WalletTransaction.objects.filter(description="Trade 42").count(), 1)

    def test_apply_trade_loss_records_loss_type(self):
        Wallet.objects.filter(pk=self.wallet.pk).update(balance=Decimal("20.00"), equity=Decimal("20.00"))
        trade = SimpleNamespace(id=43, profit=Decimal("-3.40"))

        transaction = apply_trade_profit(self.wallet, trade)
        self.wallet.refresh_from_db()

        self.assertEqual(transaction.type, "loss")
        self.assertEqual(transaction.amount, Decimal("3.40"))
        self.assertEqual(self.wallet.balance, Decimal("16.60"))
