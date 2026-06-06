"""Direct sale domain errors — single responsibility."""


class DirectSaleError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "direct_sale_error",
        http_status: int = 400,
        step: str | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status
        self.step = step
