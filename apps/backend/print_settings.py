import json
from app.core import settings

print(json.dumps({
    'LLM_PROVIDER': settings.LLM_PROVIDER,
    'LL_MODEL': settings.LL_MODEL,
    'EMBEDDING_PROVIDER': settings.EMBEDDING_PROVIDER,
    'EMBEDDING_MODEL': settings.EMBEDDING_MODEL,
    'LLM_API_KEY_present': bool(settings.LLM_API_KEY),
    'EMBEDDING_API_KEY_present': bool(settings.EMBEDDING_API_KEY),
}, indent=2))
