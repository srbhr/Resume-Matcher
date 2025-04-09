from .base import Base 
from sqlalchemy import Column, String, Integer
from sqlalchemy.orm import relationship

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)

    resumes = relationship("Resume", back_populates="owner")
    jobs = relationship("Job", back_populates="owner")