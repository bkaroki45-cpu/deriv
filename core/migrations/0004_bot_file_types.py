from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0003_python_bot_uploads")]

    operations = [
        migrations.AddField(
            model_name="bottemplate",
            name="bot_file_type",
            field=models.CharField(choices=[("python", "Python (.py)"), ("zip", "ZIP Bot Package (.zip)"), ("json", "JSON Configuration (.json)"), ("yaml", "YAML (.yaml/.yml)"), ("toml", "TOML (.toml)")], default="python", max_length=12),
        ),
        migrations.AlterField(
            model_name="bottemplate",
            name="python_file",
            field=models.FileField(blank=True, help_text="Upload the approved bot file or package.", upload_to="bot_files/"),
        ),
    ]
