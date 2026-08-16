from django.db import migrations, models
from django.core.validators import MinValueValidator


class Migration(migrations.Migration):
    dependencies = [("trading", "0006_automationrun_automatic_strategy")]

    operations = [
        migrations.AddField(
            model_name="automationrun",
            name="martingale_multiplier",
            field=models.DecimalField(
                decimal_places=2,
                default="1.00",
                help_text="Multiplier applied to the next stake after a losing trade. 1.00 disables Martingale.",
                max_digits=4,
                validators=[MinValueValidator("1.00")],
            ),
        ),
    ]
