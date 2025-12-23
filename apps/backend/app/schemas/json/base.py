import pkgutil
import importlib
from typing import Dict

# from app.schemas.json import __path__ as schema_pkg_path
from app.schemas.json import resume_analysis, resume_preview, structured_job, structured_resume


class JSONSchemaFactory:
    def __init__(self) -> None:
        self._schema: Dict[str, str] = {}
        self._discover()

    def _discover(self) -> None:
        # Explicitly register known modules to support PyInstaller/Frozen environments
        modules = [
            ("resume_analysis", resume_analysis),
            ("resume_preview", resume_preview),
            ("structured_job", structured_job),
            ("structured_resume", structured_resume),
        ]

        for name, module in modules:
            if hasattr(module, "SCHEMA"):
                self._schema[name] = getattr(module, "SCHEMA")

        # Fallback to dynamic discovery
        try:
            from app.schemas.json import __path__ as schema_pkg_path
            for finder, module_name, ispkg in pkgutil.iter_modules(schema_pkg_path):
                if module_name.startswith("_") or module_name == "base" or module_name in self._schema:
                    continue

                try:
                    module = importlib.import_module(f"app.schemas.json.{module_name}")
                    if hasattr(module, "SCHEMA"):
                        self._schema[module_name] = getattr(module, "SCHEMA")
                except Exception:
                    pass
        except Exception:
            pass

    def list_prompts(self) -> Dict[str, str]:
        return self._schema

    def get(self, name: str) -> str:
        try:
            return self._schema[name]
        except KeyError:
            raise KeyError(
                f"SCHEMA '{name}' not found. Available schemas: {list(self._schema.keys())}"
            )
