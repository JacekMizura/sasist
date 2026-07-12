"""HTTP client for Sasist printing API."""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urljoin

import requests
from requests import Response, Session

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 1.0


class ApiError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, response_body: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class SasistApiClient:
    def __init__(
        self,
        *,
        server_url: str,
        tenant_id: int,
        token: str = "",
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        self.server_url = server_url.rstrip("/")
        self.tenant_id = tenant_id
        self.token = token.strip()
        self.timeout = timeout
        self._session = Session()

    def set_token(self, token: str) -> None:
        self.token = token.strip()

    def _api_base(self) -> str:
        return f"{self.server_url}/api/printing"

    def _headers(self, *, auth: bool = True) -> dict[str, str]:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        auth: bool = True,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        url = urljoin(self._api_base() + "/", path.lstrip("/"))
        last_error: Exception | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = self._session.request(
                    method,
                    url,
                    headers=self._headers(auth=auth),
                    params=params,
                    json=json_body,
                    timeout=self.timeout,
                )
            except requests.Timeout as exc:
                last_error = exc
                logger.warning("API timeout %s %s (attempt %s/%s)", method, url, attempt, MAX_RETRIES)
            except requests.ConnectionError as exc:
                last_error = exc
                logger.warning("API connection error %s %s (attempt %s/%s)", method, url, attempt, MAX_RETRIES)
            else:
                if response.status_code >= 500 and attempt < MAX_RETRIES:
                    logger.warning(
                        "API %s returned %s (attempt %s/%s)",
                        url,
                        response.status_code,
                        attempt,
                        MAX_RETRIES,
                    )
                    time.sleep(RETRY_BACKOFF_SEC * attempt)
                    continue
                return self._parse_response(response)

            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)

        raise ApiError(f"Request failed after {MAX_RETRIES} attempts: {last_error}")

    @staticmethod
    def _parse_response(response: Response) -> Any:
        body: Any
        if response.content:
            try:
                body = response.json()
            except ValueError:
                body = response.text
        else:
            body = None

        if response.status_code >= 400:
            detail = body.get("detail") if isinstance(body, dict) else body
            raise ApiError(
                f"HTTP {response.status_code}: {detail}",
                status_code=response.status_code,
                response_body=body,
            )
        return body

    def register_agent(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self._request(
            "POST",
            "/agents/register",
            auth=False,
            params={"tenant_id": self.tenant_id},
            json_body=payload,
        )
        if not isinstance(result, dict):
            raise ApiError("Invalid register response")
        return result

    def heartbeat(
        self,
        *,
        last_poll_at: str | None = None,
        last_error: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if last_poll_at:
            body["last_poll_at"] = last_poll_at
        if last_error:
            body["last_error"] = last_error
        result = self._request("POST", "/agents/heartbeat", auth=True, json_body=body)
        if not isinstance(result, dict):
            raise ApiError("Invalid heartbeat response")
        return result

    def get_pending_jobs(self) -> list[dict[str, Any]]:
        result = self._request("GET", "/jobs/pending", auth=True)
        if not isinstance(result, dict):
            raise ApiError("Invalid pending jobs response")
        jobs = result.get("jobs", [])
        return jobs if isinstance(jobs, list) else []

    def mark_processing(self, job_id: int) -> dict[str, Any]:
        result = self._request("POST", f"/jobs/{job_id}/processing", auth=True, json_body={})
        if not isinstance(result, dict):
            raise ApiError("Invalid processing response")
        return result

    def mark_complete(self, job_id: int) -> dict[str, Any]:
        result = self._request("POST", f"/jobs/{job_id}/complete", auth=True, json_body={})
        if not isinstance(result, dict):
            raise ApiError("Invalid complete response")
        return result

    def mark_failed(self, job_id: int, error_message: str) -> dict[str, Any]:
        result = self._request(
            "POST",
            f"/jobs/{job_id}/failed",
            auth=True,
            json_body={"error_message": error_message},
        )
        if not isinstance(result, dict):
            raise ApiError("Invalid failed response")
        return result

    def download_url(self, url: str) -> bytes:
        headers: dict[str, str] = {}
        if self.token and url.startswith(self.server_url):
            headers["Authorization"] = f"Bearer {self.token}"
        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = self._session.get(url, headers=headers, timeout=self.timeout)
            except (requests.Timeout, requests.ConnectionError) as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_BACKOFF_SEC * attempt)
                continue
            if response.status_code >= 500 and attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
                continue
            if response.status_code >= 400:
                raise ApiError(f"PDF download HTTP {response.status_code}", status_code=response.status_code)
            return response.content
        raise ApiError(f"PDF download failed: {last_error}")

    def get_agent_version(self) -> dict[str, Any]:
        result = self._request(
            "GET",
            "/agent/version",
            auth=True,
            params={"tenant_id": self.tenant_id},
        )
        if not isinstance(result, dict):
            raise ApiError("Invalid version response")
        return result

    def request_test_page(self) -> dict[str, Any]:
        result = self._request(
            "POST",
            "/agents/self/test-page",
            auth=True,
            json_body={},
        )
        if not isinstance(result, dict):
            raise ApiError("Invalid test page response")
        return result
