from pydantic import BaseModel, Field


class LLMApiKeyResponse(BaseModel):
    api_key: str = Field(default="", description="Current LLM API key")


class LLMApiKeyUpdate(BaseModel):
    api_key: str = Field(default="", description="Updated LLM API key value")
