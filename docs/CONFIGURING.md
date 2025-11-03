The settings for Resume-Matcher are mainly stored in two files:
    apps/backend/.env
    apps/frontend/.env
which correspond to the settings for the backend (API provider) and frontend (UI provider), respectively.

# apps/backend/.env:
```env
SESSION_SECRET_KEY="string"
SYNC_DATABASE_URL="URL"
ASYNC_DATABASE_URL="URL"
PYTHONDONTWRITEBYTECODE=1

LLM_PROVIDER="providerstring"
LLM_API_KEY="key"
LLM_BASE_URL="url"
LL_MODEL="modelID"
EMBEDDING_PROVIDER="providerstring"
EMBEDDING_API_KEY="key"
EMBEDDING_BASE_URL=""
EMBEDDING_MODEL="modelID"
```

These last 8 settings all relate to the LLM & embedding inference
providers that Resume-Matcher uses. LLMs are AI models like GPT-4.1
or Claude 4.0 Sonnet that perform text completion/prediction. Embedding
models are models that turn text into a series of numbers that can be
compared by Resume-Matcher to find similarities. Both types of models
are needed for Resume-Matcher to work.

## "ollama" provider
The provided `.env.sample` now defaults to the OpenAI APIs. If you
prefer to run everything locally, set both `LLM_PROVIDER` and
`EMBEDDING_PROVIDER` to `"ollama"`. In that case you will just need to
set `LL_MODEL` and `EMBEDDING_MODEL` to a name shown in the output of
the `ollama list` command. `EMBEDDING_MODEL` must be the Ollama name of
a model capable of doing embeddings. `LL_MODEL` must be the Ollama name
of a model capable of doing completions.

To find a full list of models available in Ollama, go to
www.ollama.com. To download one of those models to your local computer
for use, run
```bash
ollama pull <Ollama name>
```
For example, if you want to use bge-m3, you could run
```bash
ollama pull bge-m3:latest
```
and then set EMBEDDING_MODEL="bge-m3:latest".

## "openai" provider

Setting `LLM_PROVIDER="openai"` (the value already present in
`.env.sample`) uses the OpenAI API. Supply your key through either the
shared `OPENAI_API_KEY` environment variable or by populating
`LLM_API_KEY` and `EMBEDDING_API_KEY`. Then pick the desired models, for
example:

    LL_MODEL="gpt-4.1-mini"
    EMBEDDING_MODEL="text-embedding-3-large"

You will need credit in your OpenAI account for inference charges.

## LlamaIndex providers

The third option for LLM_PROVIDER is really a collection of options. You
can take the fully-qualified Python class name of any LlamaIndex llms
provider or embeddings provider and put it into LLM_PROVIDER or
EMBEDDING_PROVIDER. This opens up 90+ LLM providers and 60+ embedding
providers for use in Resume-Matcher. In general, LLM_PROVIDER values
will begin with "llama_index.llms." and EMBEDDING_PROVIDER values will
begin with "llama_index.embeddings."

[The full list of available LlamaIndex LLM providers](https://docs.llamaindex.ai/en/stable/module_guides/models/llms/modules/#available-llm-integrations)
and [the full list of available LlamaIndex embedding providers](https://docs.llamaindex.ai/en/stable/module_guides/models/embeddings/#list-of-supported-embeddings).

As an example, let's say you wanted to set up OpenRouter as your
LLM_PROVIDER. To make this work, you will first need to install the
LlamaIndex OpenRouter provider in the backend environment:
```bash
cd apps/backend
uv pip install llama-index-llms-openrouter
```
Then in apps/backend/.env set:
```env
LLM_PROVIDER="llama_index.llms.openrouter.OpenRouter"
LL_MODEL="meta-llama/llama-4-scout"
LLM_API_KEY="<your openrouter API key>"
```

Note: OpenRouter in particular does not facilitate any embedding
models, so you will need to have another provider for the embedding
model. It is perfectly acceptable to run an OpenRouter LLM with an
Ollama or OpenAI embedding model - mix and match is fine.

Some LlamaIndex providers such as
llama_index.llms.openai_like.OpenAILike or
llama_index.embeddings.openai_like.OpenAILikeEmbedding also will
require the LLM_BASE_URL or EMBEDDING_BASE_URL setting to be set. You
can get these from your inference provider.

# apps/frontend/.env:

    NEXT_PUBLIC_API_URL="URL"

    This setting is used to tell the frontend the URL to the
    backend. It's especially important if running Resume-Matcher
    behind a reverse proxy (such as nginx). For example, if your
    reverse proxy is serving clients at
    https://resumematcher.mydomain.com then you would set
    NEXT_PUBLIC_API_URL to that.
