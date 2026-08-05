"""
Quick smoke for product variants generate path (in-memory assertions via service helpers).
"""

from backend.services.product_variants.service import value_key_for_ids


def test_value_key_sorted():
    assert value_key_for_ids([3, 1, 2]) == "1|2|3"
