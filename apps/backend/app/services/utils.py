"""
Utility functions and decorators for service layer.
"""
import asyncio
import logging
from functools import wraps
from typing import Callable, Any

from httpx import TimeoutException, ConnectError, HTTPStatusError
from app.agent.exceptions import ProviderError, StrategyError

logger = logging.getLogger(__name__)


def retry_with_exponential_backoff(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    exceptions: tuple = (
        TimeoutException,
        ConnectError,
        HTTPStatusError,
        ConnectionError,
        OSError,
        ProviderError,
        StrategyError,
    )
):
    """
    Decorator that implements retry logic with exponential backoff for async functions.
    
    This decorator is useful for handling transient failures in network calls, such as:
    - Timeout errors
    - Connection errors
    - Rate limiting (HTTP 429)
    - Temporary service unavailability
    - LLM provider errors
    - Strategy/parsing errors
    
    Args:
        max_retries: Maximum number of retry attempts (default: 3)
        initial_delay: Initial delay between retries in seconds (default: 1.0)
        max_delay: Maximum delay between retries in seconds (default: 60.0)
        exponential_base: Base for exponential backoff calculation (default: 2.0)
        exceptions: Tuple of exception types to catch and retry
                   (default: TimeoutException, ConnectError, HTTPStatusError, 
                    ConnectionError, OSError, ProviderError, StrategyError)
    
    Returns:
        Decorated function with retry logic
        
    Example:
        >>> @retry_with_exponential_backoff(max_retries=3, initial_delay=1.0)
        >>> async def call_external_api():
        >>>     return await some_api_call()
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            delay = initial_delay
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        logger.error(
                            f"Failed after {max_retries} retries: {func.__name__}. "
                            f"Last error: {str(e)}"
                        )
                        raise
                    
                    # Check if it's a rate limit error (HTTP 429) and respect Retry-After header
                    if isinstance(e, HTTPStatusError) and e.response.status_code == 429:
                        retry_after = e.response.headers.get('Retry-After')
                        if retry_after:
                            try:
                                delay = float(retry_after)
                            except ValueError:
                                pass
                    
                    logger.warning(
                        f"Attempt {attempt + 1}/{max_retries + 1} failed for {func.__name__}: {str(e)}. "
                        f"Retrying in {delay:.2f} seconds..."
                    )
                    
                    await asyncio.sleep(delay)
                    delay = min(delay * exponential_base, max_delay)
                except Exception as e:
                    # For non-retryable exceptions, raise immediately
                    logger.error(f"Non-retryable error in {func.__name__}: {str(e)}")
                    raise
            
            # This should never be reached, but just in case
            if last_exception:
                raise last_exception
            
        return wrapper
    return decorator

