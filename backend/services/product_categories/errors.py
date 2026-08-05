"""Domain errors for product categories."""


class ProductCategoryError(Exception):
    def __init__(self, message: str, *, code: str = "category_error"):
        super().__init__(message)
        self.message = message
        self.code = code


class CategoryNotFoundError(ProductCategoryError):
    def __init__(self, category_id: int):
        super().__init__(f"Nie znaleziono kategorii #{category_id}.", code="category_not_found")


class CategoryCycleError(ProductCategoryError):
    def __init__(self):
        super().__init__(
            "Nie można ustawić rodzica — powstałby cykl w drzewie kategorii.",
            code="category_cycle",
        )


class CategoryHasChildrenError(ProductCategoryError):
    def __init__(self):
        super().__init__(
            "Nie można usunąć kategorii, która ma podkategorie. Najpierw przenieś lub usuń dzieci.",
            code="category_has_children",
        )


class CategoryInUseError(ProductCategoryError):
    def __init__(self):
        super().__init__(
            "Nie można usunąć kategorii przypisanej do produktów.",
            code="category_in_use",
        )


class CategoryValidationError(ProductCategoryError):
    def __init__(self, message: str):
        super().__init__(message, code="category_validation")
