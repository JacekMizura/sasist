"""Tests for carrier barcode formatting."""

from __future__ import annotations

import unittest

from backend.utils.carrier_barcode import format_carrier_barcode


class CarrierBarcodeFormatTests(unittest.TestCase):
    def test_default_no_zero_pad(self):
        self.assertEqual(format_carrier_barcode("PAL", 10), "PAL-10")
        self.assertEqual(format_carrier_barcode("BOX", 1), "BOX-1")

    def test_optional_zero_pad(self):
        self.assertEqual(format_carrier_barcode("PAL", 10, zero_pad=6), "PAL-000010")


if __name__ == "__main__":
    unittest.main()
