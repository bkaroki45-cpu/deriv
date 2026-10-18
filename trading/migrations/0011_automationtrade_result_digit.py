from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("trading", "0010_even_odd_scanner_label")]

    operations = [
        migrations.AddField(
            model_name="automationtrade",
            name="result_digit",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
