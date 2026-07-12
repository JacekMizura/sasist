"""Resolve latest Sasist Printer Agent installer from GitHub Releases."""

from __future__ import annotations

import fnmatch
import logging
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from .release_service import AGENT_DOWNLOAD_URL, AGENT_RELEASE_VERSION

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"
CACHE_TTL_SECONDS = 10 * 60
_GITHUB_TIMEOUT = httpx.Timeout(5.0, connect=5.0, read=10.0)

BLOCKED_DOWNLOAD_HOSTS = frozenset({"releases.sasist.pl"})

_github_cache: PrinterAgentRelease | None = None
_github_cache_at: float = 0.0


@dataclass(frozen=True)
class PrinterAgentRelease:
    version: str
    download_url: str
    source: str = "github"
    cache_hit: bool = False


@dataclass(frozen=True)
class PrinterAgentDownloadDebug:
    source: str
    url: str
    env_url: str
    github_repository: str
    cache_hit: bool
    latest_version: str


def clear_printer_agent_release_cache() -> None:
    """Reset in-memory GitHub cache (tests)."""
    global _github_cache, _github_cache_at
    _github_cache = None
    _github_cache_at = 0.0


def is_dev_environment() -> bool:
    if os.getenv("ENABLE_DOWNLOAD_DEBUG", "").strip().lower() in {"1", "true", "yes"}:
        return True
    env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "")).strip().lower()
    if env in {"production", "prod", "staging"}:
        return False
    if env in {"dev", "development", "local", "test"}:
        return True
    return False


def is_production_environment() -> bool:
    env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "")).strip().lower()
    return env in {"production", "prod", "staging"}


def is_valid_download_url(url: str | None, *, allow_localhost: bool | None = None) -> bool:
    value = (url or "").strip()
    if not value.startswith(("http://", "https://")):
        return False

    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if host in BLOCKED_DOWNLOAD_HOSTS:
        return False

    localhost = host in {"localhost", "127.0.0.1", "[::1]"}
    if localhost:
        allow = not is_production_environment() if allow_localhost is None else allow_localhost
        if not allow:
            return False

    return True


def _github_repository() -> str:
    return os.getenv("GITHUB_REPOSITORY", "JacekMizura/sasist").strip()


def _asset_prefix() -> str:
    return os.getenv("GITHUB_PRINTER_AGENT_ASSET_PREFIX", "SasistPrinterAgent-Setup").strip()


def _github_token() -> str | None:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    return token or None


def normalize_release_version(tag_name: str) -> str:
    value = (tag_name or "").strip()
    if value.lower().startswith("v"):
        return value[1:]
    return value


def find_installer_asset(assets: list[dict[str, Any]], *, prefix: str) -> dict[str, Any] | None:
    pattern = f"{prefix}*.exe"
    matches: list[dict[str, Any]] = []
    for asset in assets:
        name = str(asset.get("name") or "").strip()
        if not name:
            continue
        if fnmatch.fnmatch(name, pattern):
            matches.append(asset)
    if not matches:
        return None
    matches.sort(key=lambda item: str(item.get("name") or ""))
    return matches[0]


def _github_releases_page_url() -> str:
    repo = _github_repository() or "JacekMizura/sasist"
    return f"https://github.com/{repo}/releases/latest"


def _env_fallback_release() -> PrinterAgentRelease | None:
    if not AGENT_DOWNLOAD_URL:
        return None
    if not is_valid_download_url(AGENT_DOWNLOAD_URL):
        logger.warning(
            "Ignoring invalid SASIST_AGENT_DOWNLOAD_URL (blocked or unsupported host): %s",
            AGENT_DOWNLOAD_URL,
        )
        return None
    return PrinterAgentRelease(
        version=AGENT_RELEASE_VERSION,
        download_url=AGENT_DOWNLOAD_URL,
        source="env",
    )


def _static_fallback_release() -> PrinterAgentRelease:
    return PrinterAgentRelease(
        version=AGENT_RELEASE_VERSION,
        download_url=_github_releases_page_url(),
        source="fallback",
    )


def _github_request_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "sasist-backend/printer-agent-release",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = _github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _http_get_json(url: str) -> dict[str, Any]:
    with httpx.Client(timeout=_GITHUB_TIMEOUT) as client:
        response = client.get(url, headers=_github_request_headers())
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("GitHub release payload must be a JSON object")
        return payload


def _parse_github_release(payload: dict[str, Any], *, prefix: str) -> PrinterAgentRelease | None:
    tag_name = str(payload.get("tag_name") or "").strip()
    if not tag_name:
        logger.warning("GitHub latest release missing tag_name")
        return None

    assets = payload.get("assets")
    if not isinstance(assets, list):
        logger.warning("GitHub latest release missing assets array (tag=%s)", tag_name)
        return None

    asset = find_installer_asset(assets, prefix=prefix)
    if asset is None:
        logger.warning(
            "GitHub latest release has no installer asset matching %s*.exe (tag=%s)",
            prefix,
            tag_name,
        )
        return None

    download_url = str(asset.get("browser_download_url") or "").strip()
    if not is_valid_download_url(download_url):
        logger.warning("GitHub installer asset has invalid download URL (tag=%s)", tag_name)
        return None

    return PrinterAgentRelease(
        version=normalize_release_version(tag_name),
        download_url=download_url,
        source="github",
    )


def _try_fetch_from_github() -> PrinterAgentRelease | None:
    repo = _github_repository()
    if not repo:
        logger.info("GITHUB_REPOSITORY is empty — skipping GitHub Releases lookup")
        return None

    prefix = _asset_prefix()
    url = f"{GITHUB_API_BASE}/repos/{repo}/releases/latest"
    try:
        payload = _http_get_json(url)
    except httpx.TimeoutException:
        logger.exception("GitHub Releases request timed out (repo=%s)", repo)
        return None
    except httpx.HTTPStatusError as exc:
        logger.error(
            "GitHub Releases HTTP error (repo=%s, status=%s)",
            repo,
            exc.response.status_code,
            exc_info=exc,
        )
        return None
    except httpx.HTTPError:
        logger.exception("GitHub Releases request failed (repo=%s)", repo)
        return None
    except ValueError:
        logger.exception("GitHub Releases returned invalid payload (repo=%s)", repo)
        return None

    release = _parse_github_release(payload, prefix=prefix)
    if release is None:
        return None

    logger.info(
        "Resolved printer agent release from GitHub (repo=%s, version=%s, asset_prefix=%s)",
        repo,
        release.version,
        prefix,
    )
    return release


def _log_resolved_release(release: PrinterAgentRelease) -> None:
    logger.info(
        "Printer agent download URL resolved",
        extra={
            "source": release.source,
            "url": release.download_url,
            "cache_hit": release.cache_hit,
            "version": release.version,
        },
    )


def get_latest_printer_agent_release(*, force_refresh: bool = False) -> PrinterAgentRelease:
    """
    Return latest printer agent installer metadata.

    Order: cached GitHub hit (10 min TTL) → live GitHub Releases → valid env → GitHub releases page.
    """
    global _github_cache, _github_cache_at

    now = time.monotonic()
    if (
        not force_refresh
        and _github_cache is not None
        and (now - _github_cache_at) < CACHE_TTL_SECONDS
    ):
        cached = PrinterAgentRelease(
            version=_github_cache.version,
            download_url=_github_cache.download_url,
            source=_github_cache.source,
            cache_hit=True,
        )
        _log_resolved_release(cached)
        return cached

    github_release = _try_fetch_from_github()
    if github_release is not None:
        _github_cache = github_release
        _github_cache_at = now
        _log_resolved_release(github_release)
        return github_release

    env_release = _env_fallback_release()
    if env_release is not None:
        logger.warning(
            "Using env fallback for printer agent release (version=%s)",
            env_release.version,
        )
        _log_resolved_release(env_release)
        return env_release

    fallback = _static_fallback_release()
    logger.warning(
        "Using static GitHub releases page fallback (version=%s, url=%s)",
        fallback.version,
        fallback.download_url,
    )
    _log_resolved_release(fallback)
    return fallback


def get_printer_agent_download_debug(*, force_refresh: bool = False) -> PrinterAgentDownloadDebug:
    release = get_latest_printer_agent_release(force_refresh=force_refresh)
    return PrinterAgentDownloadDebug(
        source=release.source,
        url=release.download_url,
        env_url=AGENT_DOWNLOAD_URL,
        github_repository=_github_repository(),
        cache_hit=release.cache_hit,
        latest_version=release.version,
    )
