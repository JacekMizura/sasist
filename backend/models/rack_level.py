"""
MODEL: RackLevel

1 poziom regału = 1 zamówienie.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class RackLevel(Base):
    __tablename__ = "rack_levels"

    id = Column(Integer, primary_key=True)

    storage_unit_id = Column(
        Integer,
        ForeignKey("storage_units.id"),
        nullable=False
    )

    level_number = Column(Integer, nullable=False)

    length = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)

    storage_unit = relationship(
        "StorageUnit",
        back_populates="levels"
    )
