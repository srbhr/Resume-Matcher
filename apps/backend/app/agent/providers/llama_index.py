import logging

from typing import Any, Dict, List
from fastapi.concurrency import run_in_threadpool
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.core.base.llms.base import BaseLLM

from ..exceptions import ProviderError
from .base import Provider, EmbeddingProvider
from ...core import settings

logger = logging.getLogger(__name__)

def _get_real_provider(provider_name):
    # The format this method expects is something like:
    # llama_index.llms.openai_like.OpenAILike
    # llama_index.embeddings.openai_like.OpenAILikeEmbedding
    if not isinstance(provider_name, str):
        raise ValueError("provider_name must be a string denoting a fully-qualified Python class name")
    dotpos = provider_name.rfind('.')
    if dotpos < 0:
        raise ValueError("provider_name not correctly formatted")
    classname = provider_name[dotpos+1:]
    modname = provider_name[:dotpos]
    from importlib import import_module
    rm = import_module(modname)
    return getattr(rm, classname), modname, classname

class LlamaIndexProvider(Provider):
    def __init__(self,
                 api_key: str = settings.LLM_API_KEY,
                 api_base_url: str = settings.LLM_BASE_URL,
                 model_name: str = settings.LL_MODEL,
                 provider: str = settings.LLM_PROVIDER,
                 opts: Dict[str, Any] = None):
        if opts is None:
            opts = {}
        self.opts = opts
        self._api_key = api_key
        self._api_base_url = api_base_url
        self._model = model_name
        self._provider = provider
        if not provider:
            raise ValueError("Provider string is required")
        provider_obj, self._modname, self._classname = _get_real_provider(provider)
        if not issubclass(provider_obj, BaseLLM):
            raise TypeError("LLM provider must be e.g. a llama_index.llms.* class - a subclass of llama_index.core.base.llms.base.BaseLLM")

        # This doesn't work on 100% of the LlamaIndex LLM integrations, but it's a fairly reliable pattern,
        # and works for the important ones such as OpenAILike.
        kwargs_for_provider = {'model':model_name,
                               'model_name':model_name,
                               'api_key':api_key,
                               'token':api_key,
                               'is_chat_model':False,
                               'is_function_calling_model':False}
        if api_base_url:
            kwargs_for_provider['base_url'] = \
                kwargs_for_provider['api_base'] = api_base_url
        kwargs_for_provider.update(opts)
        kwargs_for_provider['context_window'] = \
            kwargs_for_provider['max_tokens'] = kwargs_for_provider.get('num_ctx', 20000)
        self._client = provider_obj(**kwargs_for_provider)

    def _generate_sync(self, prompt: str, **options) -> str:
        """
        Generate a response from the model.
        """
        try:
            cr = self._client.complete(prompt)
            return cr.text
        except Exception as e:
            logger.error(f"llama_index sync error: {e}")
            raise ProviderError(f"llama_index - Error generating response: {e}") from e

    async def __call__(self, prompt: str, **generation_args: Any) -> str:
        if generation_args:
            logger.warning(f"LlamaIndexProvider ignoring generation_args: {generation_args}")
        return await run_in_threadpool(self._generate_sync, prompt)

class LlamaIndexEmbeddingProvider(EmbeddingProvider):
    def __init__(
        self,
        embedding_model: str = settings.EMBEDDING_MODEL,
        api_key: str = settings.EMBEDDING_API_KEY,
        api_base_url: str = settings.EMBEDDING_BASE_URL,
        provider: str = settings.EMBEDDING_PROVIDER):

        self._model = embedding_model
        self._provider = provider
        self._api_key = api_key
        self._api_base_url = api_base_url
        provider_obj, self._modname, self._classname = _get_real_provider(provider)
        if not issubclass(provider_obj, BaseEmbedding):
            raise TypeError("Embedding provider must be e.g. a llama_index.embeddings.* class - a subclass of llama_index.core.base.embeddings.base.BaseEmbedding")
        # Again, this doesn't work on 100% of the LlamaIndex embedding
        # integrations, but it's a fairly reliable pattern, and works
        # for the important ones such as OpenAILike.
        kwargs_for_provider = {'model':embedding_model,
                               'model_name':embedding_model,
                               'api_key':self._api_key,
                               'token':self._api_key,
                               'is_chat_model':False,
                               'is_function_calling_model':False}
        if self._api_base_url:
            kwargs_for_provider['base_url'] = \
                kwargs_for_provider['api_base'] = self._api_base_url
        kwargs_for_provider['context_window'] = \
            kwargs_for_provider["max_tokens"] = kwargs_for_provider.get('num_ctx', 20000)

        self._client = provider_obj(**kwargs_for_provider)

    async def embed(self, text: str) -> List[float]:
        """
        Generate an embedding for the given text.
        """
        try:
            return await run_in_threadpool(self._client.get_text_embedding, text)
        except Exception as e:
            logger.error(f"llama_index embedding error: {e}")
            raise ProviderError(f"llama_index - Error generating embedding: {e}") from e
