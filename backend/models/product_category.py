"""
Product category tree — tenant-scoped, unlimited depth.

Extension hooks (nullable / JSON) are reserved for future category-level defaults:
SKU / catalog generators, label templates, VAT, manufacturer, attributes, marketplace mapping.
Do not use those fields in v1 UI — keep the schema ready.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship

from ..database import Base


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    parent_id = Column(
        Integer,
        ForeignKey("product_categories.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    #: Sibling order under the same parent (lower = higher in list).
    sort_order = Column(Integer, nullable=False, default=0)

    # --- Numbering (SKU / catalog) — used by central product_codes service ---
    sku_code = Column(String(64), nullable=True)
    catalog_code = Column(String(64), nullable=True)
    sku_template = Column(String(255), nullable=True)
    catalog_template = Column(String(255), nullable=True)

    # --- Future extension hooks ---
    #: JSON: advanced sku generator rules beyond simple template (future).
    sku_generator_json = Column(Text, nullable=True)
    #: JSON: advanced catalog generator rules (future).
    catalog_number_generator_json = Column(Text, nullable=True)
    default_label_template_id = Column(Integer, nullable=True, index=True)
    default_vat_rate = Column(Numeric(8, 2), nullable=True)
    default_manufacturer_id = Column(
        Integer,
        ForeignKey("manufacturers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: JSON: attribute definitions / defaults for products in this category.
    attributes_schema_json = Column(Text, nullable=True)
    #: JSON: marketplace channel mappings (Allegro / Empik / …).
    marketplace_mapping_json = Column(Text, nullable=True)
    #: Catch-all for further category-level settings without migrations.
    extensions_json = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    parent = relationship("ProductCategory", remote_side=[id], back_populates="children")
    children = relationship(
        "ProductCategory",
        back_populates="parent",
        foreign_keys=[parent_id],
    )


class ProductCategoryLink(Base):
    """
    Additional (non-primary) category membership for a product.
    Primary category lives on ``products.primary_category_id``.
    """

    __tablename__ = "product_category_links"
    __table_args__ = (
        UniqueConstraint("product_id", "category_id", name="uq_product_category_link"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(
        Integer,
        ForeignKey("product_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, server_default=func.now())
