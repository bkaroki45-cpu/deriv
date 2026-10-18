from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("trading", "0009_high_digit_pair_bot")]

    operations = [
        migrations.AlterField(
            model_name="automationbot",
            name="strategy",
            field=models.CharField(
                choices=[
                    ("auto", "Automatic digit scanner"),
                    ("even_odd", "Even/Odd volatility scanner"),
                    ("high_pair", "High Digit Pair Over 2"),
                ],
                default="auto",
                max_length=12,
            ),
        ),
    ]
