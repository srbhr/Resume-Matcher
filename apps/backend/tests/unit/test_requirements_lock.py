"""requirements-lock.txt, what the Docker image installs, must match pyproject's pins."""

import re
import tomllib
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
REGENERATE = "regenerate requirements-lock.txt with the command in its header"


def _normalized(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _lock_text() -> str:
    return (BACKEND / "requirements-lock.txt").read_text()


def test_lock_pins_every_dependency_at_its_pyproject_version() -> None:
    project = tomllib.loads((BACKEND / "pyproject.toml").read_text())["project"]
    locked = {
        _normalized(name): version
        for name, version in re.findall(
            r"^([A-Za-z0-9_.-]+)==([^\s;\\]+)", _lock_text(), re.M
        )
    }
    for dependency in project["dependencies"]:
        match = re.match(r"^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?==([^;\s]+)", dependency)
        assert match, f"{dependency} is not pinned with =="
        name, version = _normalized(match.group(1)), match.group(2)
        assert locked.get(name) == version, (
            f"{dependency}: the lock has {locked.get(name)}; {REGENERATE}"
        )


def test_every_locked_package_has_a_hash() -> None:
    # Each entry is "name==version \" followed by its "--hash=sha256:..." lines.
    entries = re.split(r"^(?=[A-Za-z0-9_.-]+==)", _lock_text(), flags=re.M)[1:]
    unhashed = [e.split()[0] for e in entries if "--hash=sha256:" not in e]
    assert entries and unhashed == [], (
        f"entries without hashes: {unhashed}; {REGENERATE}"
    )
