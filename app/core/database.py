import threading
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from typing import Optional


class DatabaseConnectionSingleton:
    _instance_lock = threading.Lock()
    _instance: Optional["DatabaseConnectionSingleton"] = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._instance_lock:
                if not cls._instance:
                    cls._instance = super(DatabaseConnectionSingleton, cls).__new__(cls)
        return cls._instance
    
    def __init__(self, db_url: str):
        if not hasattr(self, "engine"):
            self.engine = create_engine(db_url, connect_args={"check_same_thread": False})
            self.session = sessionmaker(autoflush=False, bind=self.engine)

    def get_session(self):
        return self.session()