"""Run an approved Python bot that exposes Profitera's launch function.

The browser never receives a Deriv token.  This runner receives the token and
validated strategy settings through the server process environment only.
"""
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path


def _settings():
    try:
        value = json.loads(os.environ["PROFITERA_BOT_SETTINGS"])
    except (KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError("Missing valid Profitera bot settings.") from exc
    if not isinstance(value, dict):
        raise RuntimeError("Profitera bot settings must be an object.")
    return value


def main():
    path = Path(sys.argv[1]).resolve()
    spec = importlib.util.spec_from_file_location("profitera_uploaded_bot", path)
    if not spec or not spec.loader:
        raise RuntimeError("Unable to load the uploaded bot file.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    entrypoint = getattr(module, "start_bot_from_profitera", None)
    if not callable(entrypoint):
        # Standard executable Python bots remain supported unchanged.
        subprocess.run([sys.executable, str(path)], env=os.environ.copy(), check=True)
        return

    settings = _settings()
    entrypoint(
        api_token=os.environ["DERIV_API_TOKEN"],
        app_id=os.environ["DERIV_APP_ID"],
        account_id=os.environ["DERIV_ACCOUNT_ID"],
        mode=os.environ["DERIV_MODE"],
        stake=settings["stake"],
        stop_loss=settings["stop_loss"],
        take_profit=settings["take_profit"],
        max_stake=settings["max_stake"],
        martingale_multiplier=settings["martingale_multiplier"],
        durations=settings["durations"],
    )


if __name__ == "__main__":
    main()
