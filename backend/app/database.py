from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Base SQLAlchemy ORM declarative class."""


settings = get_settings()

_connect_args = (
    {"connect_timeout": 5}
    if settings.sqlalchemy_database_url.startswith("mysql")
    else {}
)

engine = create_engine(
    settings.sqlalchemy_database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=_connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Yield a transactional SQLAlchemy database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all database tables defined by SQLAlchemy models."""
    from app.models import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
