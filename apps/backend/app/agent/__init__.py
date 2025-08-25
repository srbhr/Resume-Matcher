# Generic async LLM-agent - automatic provider selection

# * Default: OpenAI provider when API key is configured (env or arg).
# * Optional: If explicitly configured with provider='ollama', use local Ollama.
# * If no valid provider credentials are available, raise ProviderError.

from .manager import AgentManager, EmbeddingManager

__all__ = ["AgentManager", "EmbeddingManager"]
