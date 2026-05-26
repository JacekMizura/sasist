"""Shared ReportLab availability check for optional PDF features."""

class PdfGenerationUnavailable(RuntimeError):
    """Raised when PDF output is requested but ReportLab is not installed."""

    def __init__(self) -> None:
        super().__init__(
            "PDF generation is not available: install the 'reportlab' package "
            "(e.g. pip install reportlab)"
        )


def raise_if_no_reportlab(available: bool) -> None:
    if not available:
        raise PdfGenerationUnavailable()
