"""Evidence-bundle directory layout + JSON helpers."""

from __future__ import annotations

import json
import os
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Bundle:
    """One run's evidence bundle under ``artifacts/e2e-monitor/<run-id>/``."""

    root: Path        # artifacts/e2e-monitor
    run_id: str

    @property
    def dir(self) -> Path:
        return self.root / self.run_id

    @property
    def logs_dir(self) -> Path:
        return self.dir / "logs"

    @property
    def data_dir(self) -> Path:
        return self.dir / "data"

    @property
    def master_dir(self) -> Path:
        return self.dir / "master"

    @property
    def private_diagnostic_path(self) -> Path:
        """Path to the local-only traceback log, which may contain response data."""
        return self.logs_dir / "private-diagnostics.log"

    def variation_dir(self, jd_key: str) -> Path:
        d = self.dir / "variations" / jd_key
        d.mkdir(parents=True, exist_ok=True)
        return d

    def ensure(self) -> None:
        for d in (self.dir, self.logs_dir, self.data_dir, self.master_dir):
            d.mkdir(parents=True, exist_ok=True)

    def write_diagnostic(self, stage: str, error: BaseException) -> None:
        """Append a detailed stage traceback to the owner-readable private log."""
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
        descriptor = os.open(self.private_diagnostic_path, flags, 0o600)
        try:
            os.fchmod(descriptor, 0o600)
            diagnostic_log = os.fdopen(descriptor, "a", encoding="utf-8")
        except Exception:
            os.close(descriptor)
            raise
        with diagnostic_log:
            diagnostic_log.write(f"\n=== {stage}: {type(error).__name__} ===\n")
            diagnostic_log.writelines(
                traceback.format_exception(type(error), error, error.__traceback__)
            )
            diagnostic_log.flush()
            os.fsync(diagnostic_log.fileno())

    @staticmethod
    def write_json(path: Path, obj: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def read_json(path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))
