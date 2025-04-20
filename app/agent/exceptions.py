class ProviderError(RuntimeError):
    """Raised when the underlying LLM provider fails"""


class StrategyError(RuntimeError):
    """Raised when a Strategy cannot parse/return expected output"""
