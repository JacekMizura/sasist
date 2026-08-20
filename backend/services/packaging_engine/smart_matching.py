"""
Smart Matching suggest entrypoint — delegates to engine v2 (min-qty) + legacy v1 fallback.
"""

from __future__ import annotations

from .smart_matching_v2 import suggest_smart_matching_v2 as suggest_smart_matching

__all__ = ["suggest_smart_matching"]
