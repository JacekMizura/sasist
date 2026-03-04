"""
BASE MODEL MIXIN

Zawiera:
- id
- created_at
- updated_at

Każdy model w systemie dziedziczy po tym mixinie.
Dzięki temu unikamy duplikacji kodu.
"""

from sqlalchemy import Column, Integer, DateTime
from datetime import datetime


class BaseModelMixin:
    """
    Wspólne pola dla wszystkich modeli.
    """

    id = Column(Integer, primary_key=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
