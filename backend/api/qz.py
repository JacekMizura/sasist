"""
QZ Tray signing endpoint for direct-print security.
Frontend calls setSignaturePromise(fn); fn(toSign) should fetch signature from backend.
Minimal implementation: returns a placeholder signature. For production, sign with your private key.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/qz", tags=["QZ Tray"])


class SignRequest(BaseModel):
    request: str  # data to sign (from QZ)


class SignResponse(BaseModel):
    signature: str  # base64 signature


@router.get("/sign")
def get_sign(request: str = "") -> SignResponse:
    """
    GET /qz/sign?request=<toSign>
    Returns a signature for the given request string.
    Minimal: placeholder. Replace with real signing using your private key.
    """
    # Placeholder: in production, sign `request` with your private key and return base64.
    _ = request
    return SignResponse(signature="")


@router.post("/sign", response_model=SignResponse)
def post_sign(body: SignRequest) -> SignResponse:
    """
    POST /qz/sign with body { "request": "<toSign>" }
    Returns a signature for the given request string.
    Minimal: placeholder. Replace with real signing using your private key.
    """
    # Placeholder: in production, sign body.request with your private key and return base64.
    return SignResponse(signature="")
