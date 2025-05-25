# Generic async LLM-agent - automatic provider selection

# * If caller supplies `openai_api_key` (arg or ENV), we use OpenAIProvider.
# * Else we fallback to a local Ollama model.
# * If neither is available, we raise -> ProviderError.

from .manager import AgentManager, EmbeddingManager

__all__ = ["AgentManager", "EmbeddingManager"]
