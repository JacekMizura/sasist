"""Customer domain errors."""


class CustomerNotFoundError(LookupError):
    pass


class CustomerBlockedError(PermissionError):
    def __init__(self, message: str = "Klient jest zablokowany"):
        super().__init__(message)
        self.message = message
