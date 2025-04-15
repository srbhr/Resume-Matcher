from .database import DatabaseConnectionSingleton
from .config import settings
from .exceptions import custom_http_exception_handler, validation_exception_handler, unhandled_exception_handler

db_singleton = DatabaseConnectionSingleton(settings.DATABASE_URL)
 
def get_db_session():
    """
    Dependency that provides a database session for the request.
    It ensures that the session is closed after the request is completed.

    Yields:
        db (Session): An active database session object.
    """
    # Create a new session for each request
    db = db_singleton.get_session()
    try:
        yield db
    finally:
        db.close()