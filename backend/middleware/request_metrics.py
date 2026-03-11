import time
from fastapi import Request
from starlette.responses import Response


async def record_request(request: Request, call_next):
    start_time = time.time()

    try:
        response: Response = await call_next(request)
    except Exception as exc:
        duration = time.time() - start_time
        print(f"❌ ERROR {request.method} {request.url.path} ({duration:.3f}s)")
        raise exc

    duration = time.time() - start_time

    print(
        f"📡 {request.method} {request.url.path} "
        f"{response.status_code} "
        f"{duration:.3f}s"
    )

    return response


async def record_error(request: Request, exc: Exception):
    print(f"🔥 EXCEPTION {request.method} {request.url.path}: {exc}")
