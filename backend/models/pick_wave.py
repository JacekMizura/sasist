"""
MODEL: PickWave & PickWaveTask

PickWave: groups pick tasks for a warehouse. wave_id links to Wave (UI).
PickWaveTask: links a pick wave to a pick task.
"""

from sqlalchemy import Column, Integer, ForeignKey, String
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class PickWave(Base, BaseModelMixin):
    __tablename__ = "pick_waves"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    wave_id = Column(
        Integer,
        ForeignKey("waves.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status = Column(String(20), nullable=False, default="created")  # created | picking | completed

    tenant = relationship("Tenant", back_populates="pick_waves")
    warehouse = relationship("Warehouse", back_populates="pick_waves")
    wave = relationship("Wave", back_populates="pick_wave", foreign_keys=[wave_id])
    pick_wave_items = relationship(
        "PickWaveItem",
        back_populates="wave",
        cascade="all, delete-orphan",
    )
    pick_wave_tasks = relationship(
        "PickWaveTask",
        back_populates="wave",
        cascade="all, delete-orphan",
    )


class PickWaveItem(Base, BaseModelMixin):
    """Legacy: links a pick wave to a pick (picks table)."""
    __tablename__ = "pick_wave_items"

    wave_id = Column(
        Integer,
        ForeignKey("pick_waves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pick_id = Column(
        Integer,
        ForeignKey("picks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    wave = relationship("PickWave", back_populates="pick_wave_items")
    pick = relationship("Pick", back_populates="pick_wave_items")


class PickWaveTask(Base, BaseModelMixin):
    """Links a pick wave to a pick task (enterprise model)."""
    __tablename__ = "pick_wave_tasks"

    wave_id = Column(
        Integer,
        ForeignKey("pick_waves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pick_task_id = Column(
        Integer,
        ForeignKey("pick_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    wave = relationship("PickWave", back_populates="pick_wave_tasks")
    pick_task = relationship("PickTask", back_populates="pick_wave_tasks")
