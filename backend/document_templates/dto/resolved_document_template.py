"""Resolved document template — complete pinned set ready for RenderPipeline."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ResolvedDocumentTemplate:
    """
    Kompletny zestaw szablonu gotowy do renderowania.

    Zawiera pinned DOCUMENT, łańcuch BASE oraz pinned PARTIALS.
    """

    main_template_name: str
    main_twig_content: str
    base_chain: tuple[tuple[str, str], ...] = ()
    partials: dict[str, str] = field(default_factory=dict)
    document_version_id: int | None = None

    def is_legacy_plain(self) -> bool:
        return not self.base_chain and not self.partials and self.main_template_name == "__plain__"
