from backend.services.product_families.generate import value_key_for_ids


def test_family_value_key_sorted_stable():
    assert value_key_for_ids([3, 1, 2]) == "1|2|3"
    assert value_key_for_ids([2, 1]) == value_key_for_ids([1, 2])
