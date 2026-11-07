"""The pin files must match pyproject: requirements-lock.txt, which the Docker image
installs, and requirements.txt, a plain list of the direct dependencies."""

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


def test_lock_pins_the_build_backend_at_its_pyproject_version() -> None:
    """The image installs the package with --no-build-isolation from the lock's hatchling."""
    (requirement,) = tomllib.loads((BACKEND / "pyproject.toml").read_text())[
        "build-system"
    ]["requires"]
    match = re.match(r"^([A-Za-z0-9_.-]+)==([^;\s]+)$", requirement)
    assert match, f"build-system requires {requirement!r}, not an exact pin"
    locked = re.search(
        rf"^{re.escape(match.group(1))}==([^\s;\\]+)", _lock_text(), re.M
    )
    assert locked and locked.group(1) == match.group(2), f"{requirement}: {REGENERATE}"


def test_every_locked_package_has_a_hash() -> None:
    # Each entry is "name==version \" followed by its "--hash=sha256:..." lines.
    entries = re.split(r"^(?=[A-Za-z0-9_.-]+==)", _lock_text(), flags=re.M)[1:]
    unhashed = [e.split()[0] for e in entries if "--hash=sha256:" not in e]
    assert entries and unhashed == [], (
        f"entries without hashes: {unhashed}; {REGENERATE}"
    )


def test_requirements_txt_lists_the_pyproject_dependencies() -> None:
    project = tomllib.loads((BACKEND / "pyproject.toml").read_text())["project"]
    listed = [
        line.strip()
        for line in (BACKEND / "requirements.txt").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert sorted(listed) == sorted(project["dependencies"]), (
        "update requirements.txt to match pyproject.toml's dependencies"
    )
