"""
Run the API from the repository root:

    python -m backend

Port: ``PORT`` env (Railway), default 8000.
Local reload: ``UVICORN_RELOAD=1 python -m backend``
"""

from backend.serve import main

if __name__ == "__main__":
    main()
