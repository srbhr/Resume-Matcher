from .base import Base
from sqlalchemy import Column, String, Integer
# from sqlalchemy.orm import relationship


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)

    # commenting the associations out for now. TODO: uncomment when we are clear about how to associate tables
    # processed_resumes = relationship(
    #     "ProcessedResume", back_populates="owner", cascade="all, delete-orphan"
    # )
    # processed_jobs = relationship(
    #     "ProcessedJob", back_populates="owner", cascade="all, delete-orphan"
    # )
