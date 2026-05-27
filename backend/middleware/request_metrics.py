import time
import traceback

from fastapi import Request
from starlette.responses import Response

from .exception_logging import log_unhandled_exception


async def record_request(request: Request, call_next):
    start_time = time.time()
    path = request.url.path
    print(f"[middleware:record_request] enter {request.method} {path}", flush=True)

    try:
        response: Response = await call_next(request)
    except Exception as exc:
        duration = time.time() - start_time
        print(
            f"[middleware:record_request] call_next FAILED {request.method} {path} "
            f"({duration:.3f}s)",
            flush=True,
        )
        print(traceback.format_exc(), flush=True)
        log_unhandled_exception(
            f"{request.method} {path} ({duration:.3f}s, record_request)",
            exc,
        )
        raise

    duration = time.time() - start_time
    print(
        f"[HTTP] {request.method} {path} {response.status_code} {duration:.3f}s",
        flush=True,
    )
    print(f"[middleware:record_request] exit {response.status_code} {path}", flush=True)
    return response
