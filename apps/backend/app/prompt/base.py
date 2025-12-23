import pkgutil
import importlib
from typing import Dict

# from app.prompt import __path__ as prompt_pkg_path
from app.prompt import resume_analysis, resume_improvement, structured_job, structured_resume


class PromptFactory:
    def __init__(self) -> None:
        self._prompts: Dict[str, str] = {}
        self._discover()

    def _discover(self) -> None:
        # Explicitly register known modules to support PyInstaller/Frozen environments
        modules = [
            ("resume_analysis", resume_analysis),
            ("resume_improvement", resume_improvement),
            ("structured_job", structured_job),
            ("structured_resume", structured_resume),
        ]

        for name, module in modules:
            if hasattr(module, "PROMPT"):
                self._prompts[name] = getattr(module, "PROMPT")

        # Fallback to dynamic discovery if needed (usually for development)
        try:
            from app.prompt import __path__ as prompt_pkg_path
            for finder, module_name, ispkg in pkgutil.iter_modules(prompt_pkg_path):
                if module_name.startswith("_") or module_name == "base" or module_name in self._prompts:
                    continue

                try:
                    module = importlib.import_module(f"app.prompt.{module_name}")
                    if hasattr(module, "PROMPT"):
                        self._prompts[module_name] = getattr(module, "PROMPT")
                except Exception:
                    pass
        except Exception:
            pass

    def list_prompts(self) -> Dict[str, str]:
        return self._prompts

    def get(self, name: str) -> str:
        try:
            return self._prompts[name]
        except KeyError:
            raise KeyError(
                f"Prompt '{name}' not found. Available prompts: {list(self._prompts.keys())}"
            )
