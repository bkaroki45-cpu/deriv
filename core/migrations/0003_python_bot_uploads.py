from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0002_bottemplate_launch_url_and_ai_analyst")]

    operations = [
        migrations.AddField(
            model_name="bottemplate",
            name="category",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="bottemplate",
            name="is_enabled",
            field=models.BooleanField(default=True, help_text="Disabled bots are hidden from the library and cannot be started."),
        ),
        migrations.AddField(
            model_name="bottemplate",
            name="python_file",
            field=models.FileField(blank=True, help_text="Upload an approved Python (.py) bot file.", upload_to="python_bots/"),
        ),
        migrations.CreateModel(
            name="BotExecution",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("account_id", models.CharField(max_length=64)),
                ("mode", models.CharField(blank=True, max_length=10)),
                ("pid", models.PositiveIntegerField(blank=True, null=True)),
                ("status", models.CharField(default="starting", max_length=20)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("bot", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="executions", to="core.bottemplate")),
                ("user", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="bot_executions", to="accounts.user")),
            ],
            options={"ordering": ("-started_at",)},
        ),
    ]
