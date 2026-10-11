"""Resume Matcher Backend - Lean & Local"""

import os

# Use the model registry bundled with the pinned LiteLLM instead of fetching
# GitHub's main branch at import, so model capabilities (temperature, JSON mode,
# max tokens) only change with a LiteLLM version bump. Runs in the package init
# because it must precede every litellm import. Set the environment variable
# LITELLM_LOCAL_MODEL_COST_MAP=False to opt back into the live registry.
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")

__version__ = "1.3.0"
