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
or Claude 4.0 Sonnet that do text completion/prediction. Embedding
models are models that turn text into a series of numbers that can be
compared by Resume-Matcher to find similarities. Both types of models
are needed for Resume-Matcher to work.

## "ollama" provider
By default, Resume-Matcher uses an LLM_PROVIDER and EMBEDDING_PROVIDER
of "ollama", which runs the LLM and embedding model on your local
computer. In that case you will just need to set LL_MODEL and
EMBEDDING_MODEL to a "NAME" shown in the output of the "ollama list"
command. EMBEDDING_MODEL must be the Ollama name of a model capable of
doing embeddings. LL_MODEL must be the Ollama name of a model capable
of doing completions.

To find a full list of models available in Ollama, go to
www.ollama.com. To download one of those models to your local computer
for use, run ```bash
ollama pull <Ollama name>```. For example, if you want to
use bge-m3, you could run ```bash
ollama pull bge-m3:latest``` and then set
EMBEDDING_MODEL="bge-m3:latest".

## "openai" provider

Another possible value for LLM_PROVIDER and/or EMBEDDING_PROVIDER is
"openai". This uses the OpenAI API to talk to OpenAI's servers, which
are really fast at running AI models. In the .env file, you will need
an OpenAI API key set in LLM_API_KEY, and the same key in
EMBEDDING_API_KEY. Then set

    LL_MODEL="gpt-4.1"
    EMBEDDING_MODEL="text-embedding-3-large"
(or whatever other OpenAI model ID's you want to use). You will need
money in your OpenAI account

## "gemini" provider

Want to use Google's powerful Gemini models for Resume-Matcher? Here's how to set it up:

1.  **Choose Gemini as your Provider:**
    In your `apps/backend/.env` file, set 
    ```env
    LLM_PROVIDER = "gemini"
    EMBEDDING_PROVIDER = "gemini"
    ```
    This tells Resume-Matcher to use Google's AI services.

2.  **Get Your Gemini API Key:**
    Create an api key from [Google AI Studio](https://aistudio.google.com/apikey). Once you have it, set api-keys for both LLM and embedding models: 
    ```env
    LLM_API_KEY = "your_gemini_api_key"
    EMBEDDING_API_KEY = "your_gemini_api_key"
    ```.

3.  **Select Your Gemini Models:**
    After setting your API key, specify which Gemini models you want to use. For example:
    ```env
    LL_MODEL = "gemini-2.5-flash"
    EMBEDDING_MODEL = "gemini-embedding-001"
    ```


## LlamaIndex providers

The third option for LLM_PROVIDER is really a bunch of options. You
can take the fully-qualified Python class name of any LlamaIndex llms
provider or embeddings provider and put it into LLM_PROVIDER or
EMBEDDING_PROVIDER. This opens up 90+ LLM providers and 60+ embedding
providers for use in Resume-Matcher.  In general, LLM_PROVIDER values
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

N.B. OpenRouter in particular does not facilitate any embedding
models, so you will need to have another provider for the embedding
model. It is perfectly acceptable to run an OpenRouter LLM with an
ollama or openai embedding model - mix and match is fine.

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