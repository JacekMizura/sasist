"""Domain errors for product code generation."""


class ProductCodeError(Exception):
    def __init__(self, message: str, *, code: str = "product_code_error"):
        super().__init__(message)
        self.message = message
        self.code = code


class ProductCodeNoCategoryError(ProductCodeError):
    def __init__(self, kind: str = "sku"):
        if kind == "catalog":
            msg = "Aby wygenerować numer katalogowy należy najpierw wybrać kategorię."
        else:
            msg = "Aby wygenerować SKU należy najpierw wybrać kategorię."
        super().__init__(msg, code="no_category")


class ProductCodeNotConfiguredError(ProductCodeError):
    def __init__(self):
        super().__init__(
            "Dla tej kategorii nie skonfigurowano sposobu numeracji.",
            code="not_configured",
        )


class ProductCodeValidationError(ProductCodeError):
    def __init__(self, message: str):
        super().__init__(message, code="validation")
