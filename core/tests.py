from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import OAuthToken
from core.deriv_api import seal_token
from core.views import app_session


@override_settings(
	PROFITERA_DIGITS_URL="http://127.0.0.1:3001/trade/digits/",
	PROFITERA_RISE_FALL_URL="http://127.0.0.1:3002/trade/rise-fall/",
	PROFITERA_ACCUMULATORS_URL="http://127.0.0.1:3003/trade/accumulators/",
	PROFITERA_BOT_URL="http://127.0.0.1:4003/",
)
class AppSessionTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(
			username="session-user",
			email="session-user@example.test",
		)
		self.token = OAuthToken.objects.create(
			user=self.user,
			access_token=seal_token("server-held-deriv-token"),
			expires_at=timezone.now() + timedelta(hours=1),
			is_valid=True,
		)

	def test_authenticated_app_session_returns_token_to_configured_origin(self):
		self.client.force_login(self.user)
		session = self.client.session
		session["deriv_token_id"] = self.token.id
		session.save()

		response = self.client.get(
			"/api/deriv/app-session/",
			HTTP_ORIGIN="http://127.0.0.1:3001",
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()["auth_info"]["access_token"], "server-held-deriv-token")
		self.assertEqual(response["Access-Control-Allow-Origin"], "http://127.0.0.1:3001")
		self.assertEqual(response["Access-Control-Allow-Credentials"], "true")

	def test_unauthenticated_app_session_returns_to_configured_app(self):
		app_url = "http://127.0.0.1:3001/trade/digits/"

		response = self.client.get(
			"/api/deriv/app-session/",
			{"next": app_url},
			HTTP_ORIGIN="http://127.0.0.1:3001",
		)

		self.assertEqual(response.status_code, 401)
		login_url = urlsplit(response.json()["login_url"])
		self.assertEqual(login_url.path, "/login/")
		self.assertEqual(parse_qs(login_url.query)["next"], [app_url])

	def test_unauthenticated_app_session_rejects_unconfigured_return_origin(self):
		response = self.client.get(
			"/api/deriv/app-session/",
			{"next": "https://attacker.example/"},
		)

		self.assertEqual(response.status_code, 401)
		self.assertEqual(response.json()["login_url"], "/login/")
