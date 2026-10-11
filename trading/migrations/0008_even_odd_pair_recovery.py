from django.db import migrations, models


def create_even_odd_bot(apps, schema_editor):
    AutomationBot = apps.get_model("trading", "AutomationBot")
    AutomationBot.objects.get_or_create(
        name="Even / Odd Pair Recovery",
        defaults={
            "description": "Scans one selected Volatility index and trades the opposite parity after two consecutive same-parity digits. Stops after a win or configured risk limits.",
            "strategy": "even_odd",
            "enabled": True,
            "demo_only": True,
            "live_trading_enabled": False,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("trading", "0007_automationrun_martingale_multiplier")]

    operations = [
        migrations.AddField(
            model_name="automationbot",
            name="strategy",
            field=models.CharField(
                choices=[("auto", "Automatic digit scanner"), ("even_odd", "Even/Odd pair recovery")],
                default="auto",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="automationrun",
            name="capital_limit",
            field=models.DecimalField(blank=True, decimal_places=2, help_text="Maximum total stake amount allocated during this run.", max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="automationrun",
            name="max_martingale_steps",
            field=models.PositiveIntegerField(default=0, help_text="Maximum recovery trades after the initial losing trade."),
        ),
        migrations.AlterField(
            model_name="automationrun",
            name="strategy",
            field=models.CharField(choices=[("auto", "Automatic"), ("over_2", "Over 2"), ("under_7", "Under 7"), ("even_odd", "Even/Odd")], default="over_2", max_length=12),
        ),
        migrations.RunPython(create_even_odd_bot, migrations.RunPython.noop),
    ]