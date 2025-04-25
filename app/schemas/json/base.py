import pkgutil
import importlib
from typing import Dict

from app.schemas.json import __path__ as schema_pkg_path


class JSONSchemaFactory:
    def __init__(self) -> None:
        self._schema: Dict[str, str] = {}
        self._discover()

    def _discover(self) -> None:
        for finder, module_name, ispkg in pkgutil.iter_modules(schema_pkg_path):
            if module_name.startswith("_") or module_name == "base":
                continue

            module = importlib.import_module(f"app.schemas.json.{module_name}")
            if hasattr(module, "SCHEMA"):
                self._schema[module_name] = getattr(module, "SCHEMA")

    def list_prompts(self) -> Dict[str, str]:
        return self._schema

    def get(self, name: str) -> str:
        try:
            return self._schema[name]
        except KeyError:
            raise KeyError(
                f"SCHEMA '{name}' not found. Available schemas: {list(self._schema.keys())}"
            )
