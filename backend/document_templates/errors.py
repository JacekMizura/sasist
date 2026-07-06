"""Document Templates domain errors."""


class DocumentTemplateError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "error",
        validation: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.validation = validation


class DocumentTemplateNotFoundError(DocumentTemplateError):
    def __init__(self, message: str = "Szablon nie istnieje.") -> None:
        super().__init__(message, code="not_found")


class DocumentKindNotFoundError(DocumentTemplateError):
    def __init__(self, message: str = "Typ dokumentu nie istnieje.") -> None:
        super().__init__(message, code="kind_not_found")


class DocumentRenderError(DocumentTemplateError):
    def __init__(self, message: str, *, code: str = "render_error") -> None:
        super().__init__(message, code=code)


class DocumentProviderError(DocumentTemplateError):
    def __init__(self, message: str, *, code: str = "provider_error") -> None:
        super().__init__(message, code=code)
