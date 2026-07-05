"""Tag registry for custom Twig tags (include_document, future layout tags)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TwigTagRegistry:
    _tags: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self._tags.update({"include_document", "extends", "block", "endblock"})

    def register_tag(self, name: str) -> None:
        self._tags.add(str(name).strip())

    def known_tags(self) -> frozenset[str]:
        return frozenset(self._tags)

    def is_known(self, name: str) -> bool:
        return str(name).strip().lower() in {t.lower() for t in self._tags}


_default_registry: TwigTagRegistry | None = None


def get_twig_tag_registry() -> TwigTagRegistry:
    global _default_registry
    if _default_registry is None:
        _default_registry = TwigTagRegistry()
    return _default_registry
