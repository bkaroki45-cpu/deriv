import asyncio
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from accounts.models import DerivAccount
from .automation import analyse_even_odd, analyse_high_digit_pair, buy_payload, buy_with_fresh_proposal, capital_allows, deriv_request_context, proposal_payload, recovery_action, recovery_stake
from .models import AutomationBot, AutomationRun


class EvenOddSignalTests(TestCase):
	def test_two_even_digits_signal_odd(self):
		signal = analyse_even_odd([1, 2, 8])

		self.assertEqual(signal["contract_type"], "DIGITODD")
		self.assertEqual(signal["direction"], "odd")
		self.assertEqual(signal["pair"], [2, 8])

	def test_two_odd_digits_signal_even(self):
		signal = analyse_even_odd([3, 9])

		self.assertEqual(signal["contract_type"], "DIGITEVEN")
		self.assertEqual(signal["direction"], "even")

	def test_mixed_or_insufficient_digits_do_not_signal(self):
		self.assertIsNone(analyse_even_odd([2, 3]))
		self.assertIsNone(analyse_even_odd([8]))

	def test_even_odd_proposal_omits_barrier_but_over_two_keeps_it(self):
		parity = proposal_payload("0.50", "USD", "1HZ10V", "DIGITODD")
		over_two = proposal_payload("0.50", "USD", "1HZ10V", "DIGITOVER", "2")

		self.assertNotIn("barrier", parity)
		self.assertEqual(parity["underlying_symbol"], "1HZ10V")
		self.assertNotIn("symbol", parity)
		self.assertEqual(over_two["barrier"], "2")
		self.assertEqual(buy_payload("proposal-id", 0.35), {"buy": "proposal-id", "price": "0.35"})

	def test_deriv_error_context_identifies_contract_request_without_secrets(self):
		context = deriv_request_context({
			"proposal": 1,
			"contract_type": "DIGITODD",
			"underlying_symbol": "1HZ75V",
		})

		self.assertEqual(context, "request=proposal, contract_type=DIGITODD, underlying_symbol=1HZ75V")

	def test_recovery_stake_and_capital_budget(self):
		self.assertEqual(recovery_stake("0.50", "2", 3), Decimal("4.00"))
		self.assertTrue(capital_allows("10", ["0.50", "1.00"], "2.00"))
		self.assertFalse(capital_allows("3", ["0.50", "1.00"], "2.00"))

	def test_recovery_repeats_losses_but_stops_after_win_or_limit(self):
		self.assertEqual(recovery_action("-0.50", 1, 3), "retry")
		self.assertEqual(recovery_action("1.00", 1, 3), "complete_win")
		self.assertEqual(recovery_action("-4.00", 4, 3), "complete_limit")


class ProposalRetryTests(SimpleTestCase):
	def test_unknown_proposal_retries_once_with_a_fresh_quote(self):
		class FakeRouter:
			def __init__(self):
				self.proposal_count = 0
				self.buy_ids = []

			async def request(self, payload):
				if "proposal" in payload:
					self.proposal_count += 1
					return {"proposal": {"id": f"proposal-{self.proposal_count}", "ask_price": 0.35}}
				self.buy_ids.append(payload["buy"])
				if payload["buy"] == "proposal-1":
					raise RuntimeError("Unknown contract proposal")
				return {"buy": {"contract_id": "contract-1"}}

		router = FakeRouter()
		result = asyncio.run(buy_with_fresh_proposal(router, proposal_payload("0.35", "USD", "1HZ75V", "DIGITODD")))

		self.assertEqual(result["buy"]["contract_id"], "contract-1")
		self.assertEqual(router.proposal_count, 2)
		self.assertEqual(router.buy_ids, ["proposal-1", "proposal-2"])


class HighDigitPairSignalTests(TestCase):
	def distribution(self, counts):
		return [digit for digit, count in enumerate(counts) for _ in range(count)]

	def test_accepts_mixed_pair_after_screen_qualifies(self):
		history = self.distribution([5, 5, 5, 10, 10, 10, 10, 10, 20, 15])
		history[-2:] = [7, 9]

		signal = analyse_high_digit_pair(history)

		self.assertTrue(signal["eligible"])
		self.assertTrue(signal["pair_ready"])
		self.assertEqual(signal["pair"], [7, 9])
		self.assertEqual(signal["dominant_digit"], 8)

	def test_each_low_digit_must_be_strictly_below_ten_percent(self):
		history = self.distribution([10, 5, 5, 10, 10, 10, 10, 10, 15, 15])

		signal = analyse_high_digit_pair(history)

		self.assertFalse(signal["eligible"])

	def test_dominant_digit_must_be_from_five_through_nine(self):
		history = self.distribution([20, 5, 5, 10, 10, 10, 10, 10, 10, 10])

		signal = analyse_high_digit_pair(history)

		self.assertFalse(signal["eligible"])

	def test_pair_requires_two_consecutive_digits_from_seven_to_nine(self):
		history = self.distribution([5, 5, 5, 10, 10, 10, 10, 10, 20, 15])
		history[-2:] = [7, 6]

		signal = analyse_high_digit_pair(history)

		self.assertTrue(signal["eligible"])
		self.assertFalse(signal["pair_ready"])


class HighDigitPairBotApiTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(
			username="high-pair-user",
			email="high-pair-user@example.test",
		)
		self.account = DerivAccount.objects.create(
			user=self.user,
			account_id="VRTC67890",
			account_type="demo",
			currency="USD",
			is_active=True,
		)
		self.bot = AutomationBot.objects.get(name="High Digit Pair Over 2")
		self.client = APIClient()
		self.client.force_authenticate(self.user)
		self.url = f"/api/trading/automation/bots/{self.bot.id}/run/"

	def payload(self):
		return {
			"account_id": self.account.account_id,
			"scan_all_volatility": True,
			"stake": "0.50",
			"max_martingale_steps": 3,
			"martingale_multiplier": "2",
			"max_daily_loss": "5.00",
		}

	def test_high_pair_bot_rejects_real_accounts(self):
		real_account = DerivAccount.objects.create(
			user=self.user,
			account_id="CR67890",
			account_type="real",
			currency="USD",
		)
		payload = self.payload()
		payload["account_id"] = real_account.account_id

		response = self.client.post(self.url, payload, format="json")

		self.assertEqual(response.status_code, 400)

	def test_run_uses_stake_and_martingale_without_a_capital_limit(self):
		response = self.client.post(self.url, self.payload(), format="json")

		self.assertEqual(response.status_code, 200)
		run = AutomationRun.objects.get(user=self.user, bot=self.bot)
		self.assertEqual(run.strategy, "high_pair")
		self.assertEqual(run.symbols, ["__all_volatility__"])
		self.assertIsNone(run.capital_limit)
		self.assertEqual(run.max_martingale_steps, 3)
		self.assertEqual(run.martingale_multiplier, Decimal("2.00"))


class EvenOddBotApiTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(
			username="even-odd-user",
			email="even-odd-user@example.test",
		)
		self.account = DerivAccount.objects.create(
			user=self.user,
			account_id="VRTC12345",
			account_type="demo",
			currency="USD",
			is_active=True,
		)
		self.bot, _ = AutomationBot.objects.get_or_create(
			name="Even / Odd Pair Recovery",
			defaults={"strategy": "even_odd", "enabled": True},
		)
		self.bot.enabled = True
		self.bot.strategy = "even_odd"
		self.bot.save(update_fields=["enabled", "strategy"])
		self.client = APIClient()
		self.client.force_authenticate(self.user)
		self.url = f"/api/trading/automation/bots/{self.bot.id}/run/"

	def payload(self):
		return {
			"account_id": self.account.account_id,
			"symbols": ["1HZ10V"],
			"scan_all_volatility": False,
			"strategy": "even_odd",
			"stake": "0.50",
			"capital_limit": "10.00",
			"max_martingale_steps": 3,
			"martingale_multiplier": "2",
		}

	def test_run_requires_a_capital_limit(self):
		payload = self.payload()
		payload.pop("capital_limit")

		response = self.client.post(self.url, payload, format="json")

		self.assertEqual(response.status_code, 400)

	def test_even_odd_bot_rejects_real_accounts(self):
		real_account = DerivAccount.objects.create(
			user=self.user,
			account_id="CR12345",
			account_type="real",
			currency="USD",
		)
		payload = self.payload()
		payload["account_id"] = real_account.account_id

		response = self.client.post(self.url, payload, format="json")

		self.assertEqual(response.status_code, 400)

	def test_run_persists_selected_market_and_recovery_limits(self):
		response = self.client.post(self.url, self.payload(), format="json")

		self.assertEqual(response.status_code, 200)
		run = AutomationRun.objects.get(user=self.user, bot=self.bot)
		self.assertEqual(run.strategy, "even_odd")
		self.assertEqual(run.symbols, ["1HZ10V"])
		self.assertEqual(run.capital_limit, Decimal("10.00"))
		self.assertEqual(run.max_martingale_steps, 3)

	def test_user_cannot_start_a_second_bot_run_concurrently(self):
		first_response = self.client.post(self.url, self.payload(), format="json")
		other_bot = AutomationBot.objects.create(name="Second test bot", enabled=True)
		second_url = f"/api/trading/automation/bots/{other_bot.id}/run/"

		response = self.client.post(second_url, self.payload(), format="json")

		self.assertEqual(first_response.status_code, 200)
		self.assertEqual(response.status_code, 409)
