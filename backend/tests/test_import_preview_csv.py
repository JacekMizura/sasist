"""CSV import preview: delimiter detection (sniffer + fallbacks), UTF-8 BOM."""

from backend.services.import_service import (
    _decode_preview_csv_bytes,
    _detect_preview_csv_delimiter,
)


def test_detect_delimiter_semicolon_polish_style():
    lines = ["Nazwa;SKU;Cena", "Produkt A;ABC;12,5", "Produkt B;DEF;3"]
    delim, src = _detect_preview_csv_delimiter(lines)
    assert delim == ";"
    assert src in ("sniff", "fallback")


def test_detect_delimiter_comma():
    lines = ["name,sku,price", "foo,1,2.5", "bar,2,3"]
    delim, _src = _detect_preview_csv_delimiter(lines)
    assert delim == ","


def test_detect_delimiter_tab():
    lines = ["name\tsku\tqty", "a\tb\t1", "c\td\t2"]
    delim, _src = _detect_preview_csv_delimiter(lines)
    assert delim == "\t"


def test_detect_delimiter_pipe():
    lines = ["name|sku", "x|y", "p|q"]
    delim, _src = _detect_preview_csv_delimiter(lines)
    assert delim == "|"


def test_one_column_prefers_semicolon_order_tie():
    lines = ["SKU", "A001", "B002"]
    delim, _src = _detect_preview_csv_delimiter(lines)
    assert delim == ";"


def test_decode_utf8_bom_strips_bom_for_parser():
    # Encoder adds UTF-8 BOM bytes; content must not embed U+FEFF to avoid double-BOM edge cases.
    raw = "a;b;c\n1;2;3".encode("utf-8-sig")
    text = _decode_preview_csv_bytes(raw)
    assert text is not None
    assert not text.startswith("\ufeff")
    d, _ = _detect_preview_csv_delimiter(text.splitlines())
    assert d == ";"


def test_polish_excel_like_quoted_semicolon_with_comma_decimal():
    # UTF-8 BOM + semicolon + quoted field with comma as decimal separator
    raw = (
        "Nazwa;Cena brutto\n"
        '"My product, Ltd";"12,50"\n'
        "Other;3,25\n"
    ).encode("utf-8-sig")
    decoded = _decode_preview_csv_bytes(raw)
    assert decoded is not None
    lines = decoded.splitlines()
    delim, _ = _detect_preview_csv_delimiter(lines)
    assert delim == ";"
    import csv

    rows = list(csv.reader(lines, delimiter=delim, quotechar='"'))
    assert rows[0] == ["Nazwa", "Cena brutto"]
    assert rows[1][0] == "My product, Ltd"


def test_decode_invalid_bytes_returns_none():
    raw = b"\xff\xfe\x00\x01"
    assert _decode_preview_csv_bytes(raw) is None
