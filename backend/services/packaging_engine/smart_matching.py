"""Smart Matching public entry — engine v2."""

from .smart_matching_v2 import evaluate_smart_matching_v2, suggest_smart_matching_v2

suggest_smart_matching = suggest_smart_matching_v2

__all__ = ["suggest_smart_matching", "evaluate_smart_matching_v2"]
