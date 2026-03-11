"""
MODEL: Label Size

Defines physical label dimensions (e.g. 50x30mm, A6).
Used by label_sizes API for designer reference.
"""

from sqlalchemy import Column, String, Integer
from ..database import Base
from .base import BaseModelMixin


class LabelSize(Base, BaseModelMixin):
    __tablename__ = "label_sizes"

    name = Column(String(64), nullable=False)
    width_mm = Column(Integer, nullable=False)
    height_mm = Column(Integer, nullable=False)
