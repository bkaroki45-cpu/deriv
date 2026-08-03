"""Launch the command declared in an admin-approved JSON, YAML, or TOML bot config.

Example JSON: {"command": ["python", "/opt/profitera-bots/my_bot.py"]}
The child inherits the current user's DERIV_* environment values from the
Profitera launcher, rather than asking the user to authenticate again.
"""
import json
import os
import subprocess
import sys
from pathlib import Path


def load_config(path):
    suffix = Path(path).suffix.lower()
    with open(path, "rb") as source:
        if suffix == ".json":
            return json.load(source)
        if suffix == ".toml":
            import tomllib
            return tomllib.loads(source.read().decode("utf-8"))
        if suffix in {".yaml", ".yml"}:
            try:
                import yaml
            except ImportError as exc:
                raise RuntimeError("YAML bot packages require PyYAML.") from exc
            return yaml.safe_load(source) or {}
    raise RuntimeError("Unsupported configuration type.")


def main():
    config = load_config(sys.argv[1])
    command = config.get("command") if isinstance(config, dict) else None
    if not isinstance(command, list) or not command or not all(isinstance(part, str) for part in command):
        raise RuntimeError('Bot configuration needs a "command" array to launch its bot.')
    subprocess.run(command, env=os.environ.copy(), check=True)


if __name__ == "__main__":
    main()
