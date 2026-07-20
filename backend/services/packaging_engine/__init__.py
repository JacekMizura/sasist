"""Unified packaging intelligence — Smart Matching + 3D Matching → wspólny model propozycji."""

from .engine import build_packaging_suggestions_for_order
from .cartonization_solver import PackagingFitResult, solve_cartonization

__all__ = ["build_packaging_suggestions_for_order", "solve_cartonization", "PackagingFitResult"]
