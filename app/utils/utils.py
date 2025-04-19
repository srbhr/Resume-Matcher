from app.core.config import settings
from app.core.database import DatabaseConnectionSingleton


def get_db_session():
    db_singleton = DatabaseConnectionSingleton(settings.DATABASE_URL)
    db = db_singleton.get_session()
    try:
        yield db
    finally:
        db.close()
