"""SQLAlchemy ORM models: users, reviews, review_items."""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    ip_address = Column(String(45), nullable=True, index=True)
    github_username = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_active_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    review_count = Column(Integer, default=0, nullable=False)

    reviews = relationship("Review", back_populates="user", cascade="all, delete-orphan")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    review_type = Column(String(20), nullable=False)  # "pr" or "snippet"

    # PR-specific fields
    repo_owner = Column(String(255), nullable=True)
    repo_name = Column(String(255), nullable=True)
    pr_number = Column(Integer, nullable=True)
    head_sha = Column(String(40), nullable=True)
    pr_title = Column(String(500), nullable=True)

    # Snippet-specific fields
    language = Column(String(50), nullable=True)
    code_snippet_hash = Column(String(64), nullable=True)

    # Review results
    summary = Column(Text, nullable=True)
    overall_quality = Column(String(30), nullable=True)
    severity_counts = Column(JSON, nullable=True)
    top_priority_fixes = Column(JSON, nullable=True)
    files_reviewed = Column(Integer, default=0)
    review_time_ms = Column(Integer, default=0)

    # Cache key: composite of (repo_owner, repo_name, pr_number, head_sha)
    cache_key = Column(String(255), nullable=True, unique=True, index=True)

    # Metadata
    status = Column(String(20), default="pending", nullable=False)
    cached = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="reviews")
    items = relationship("ReviewItemDB", back_populates="review", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_reviews_cache_key", "cache_key"),
        Index("ix_reviews_repo_pr", "repo_owner", "repo_name", "pr_number"),
    )


class ReviewItemDB(Base):
    __tablename__ = "review_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    review_id = Column(String(36), ForeignKey("reviews.id"), nullable=False, index=True)

    severity = Column(String(20), nullable=False)
    category = Column(String(30), nullable=False)
    file_path = Column(String(500), nullable=True)
    line_range = Column(String(20), nullable=True)
    title = Column(String(500), nullable=False)
    suggestion = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)
    code_before = Column(Text, nullable=True)
    code_after = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    review = relationship("Review", back_populates="items")
