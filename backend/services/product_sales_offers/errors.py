"""Product sales offer domain errors."""


class ProductSalesOfferError(Exception):
    def __init__(self, detail: str, *, code: str = "offer_error", http_status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.http_status = http_status


class OfferStockUnavailableError(ProductSalesOfferError):
    def __init__(self, detail: str):
        super().__init__(detail, code="offer_stock_unavailable", http_status=409)
