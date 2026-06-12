import asyncio
import logging

from django.core.management.base import BaseCommand

from markets.services.deriv_ws import DerivMarketStream

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Starts the Deriv WebSocket market stream (ticks → channels → frontend)"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting Deriv market stream..."))
        try:
            stream = DerivMarketStream()
            asyncio.run(stream.connect())
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Market stream stopped by user."))
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Market stream error: {exc}"))
            logger.exception("Deriv market stream crashed")
