#!/usr/bin/env python3
"""Railway / Procfile entrypoint — the only supported way to start the API in production."""

from backend.serve import main

if __name__ == "__main__":
    main()
