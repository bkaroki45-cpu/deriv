import asyncio
from django.core.management.base import BaseCommand
from trading.automation import AutomationWorker


class Command(BaseCommand):
    help = "Run Profiteraa demo automation sessions."

    def handle(self, *args, **options):
        asyncio.run(AutomationWorker().run_forever())
