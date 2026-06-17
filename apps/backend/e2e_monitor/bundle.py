"""Evidence-bundle directory layout + JSON helpers."""

from __future__ import annotations

import json
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

    def variation_dir(self, jd_key: str) -> Path:
        d = self.dir / "variations" / jd_key
        d.mkdir(parents=True, exist_ok=True)
        return d

    def ensure(self) -> None:
        for d in (self.dir, self.logs_dir, self.data_dir, self.master_dir):
            d.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def write_json(path: Path, obj: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def read_json(path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))
