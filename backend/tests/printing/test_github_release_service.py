"""GitHub Releases resolution for Sasist Printer Agent installer."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx

from backend.services.printing import github_release_service as svc


def _github_payload(*, tag: str = "v1.0.2", asset_name: str = "SasistPrinterAgent-Setup-1.0.2.exe") -> dict:
    return {
        "tag_name": tag,
        "assets": [
            {
                "name": asset_name,
                "browser_download_url": f"https://github.com/JacekMizura/sasist/releases/download/{tag}/{asset_name}",
            }
        ],
    }


class GitHubReleaseServiceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        svc.clear_printer_agent_release_cache()

    def tearDown(self) -> None:
        svc.clear_printer_agent_release_cache()

    @patch.object(svc, "_http_get_json")
    def test_release_exists(self, mock_get_json):
        mock_get_json.return_value = _github_payload()

        release = svc.get_latest_printer_agent_release(force_refresh=True)

        self.assertEqual(release.version, "1.0.2")
        self.assertIn("github.com", release.download_url)
        self.assertEqual(release.source, "github")
        mock_get_json.assert_called_once()

    @patch.object(svc, "_http_get_json")
    def test_missing_asset_falls_back_to_env(self, mock_get_json):
        mock_get_json.return_value = {
            "tag_name": "v1.0.2",
            "assets": [{"name": "notes.txt", "browser_download_url": "https://example.com/notes.txt"}],
        }

        with patch.object(svc, "AGENT_RELEASE_VERSION", "9.9.9"), patch.object(
            svc,
            "AGENT_DOWNLOAD_URL",
            "https://fallback.example/installer.exe",
        ):
            release = svc.get_latest_printer_agent_release(force_refresh=True)

        self.assertEqual(release.source, "env")
        self.assertEqual(release.version, "9.9.9")
        self.assertEqual(release.download_url, "https://fallback.example/installer.exe")

    @patch.object(svc, "_http_get_json")
    def test_github_timeout_falls_back_to_env(self, mock_get_json):
        mock_get_json.side_effect = httpx.TimeoutException("timed out")

        with patch.object(svc, "AGENT_RELEASE_VERSION", "1.0.0"), patch.object(
            svc,
            "AGENT_DOWNLOAD_URL",
            "https://fallback.example/setup.exe",
        ):
            release = svc.get_latest_printer_agent_release(force_refresh=True)

        self.assertEqual(release.source, "env")
        self.assertEqual(release.download_url, "https://fallback.example/setup.exe")

    @patch.object(svc, "_http_get_json")
    def test_github_404_uses_fallback_not_dead_domain(self, mock_get_json):
        request = httpx.Request("GET", "https://api.github.com/repos/x/y/releases/latest")
        response = httpx.Response(404, request=request)
        mock_get_json.side_effect = httpx.HTTPStatusError("not found", request=request, response=response)

        with patch.object(svc, "AGENT_DOWNLOAD_URL", "https://releases.sasist.pl/printer-agent/bad.zip"):
            release = svc.get_latest_printer_agent_release(force_refresh=True)

        self.assertEqual(release.source, "fallback")
        self.assertIn("github.com", release.download_url)
        self.assertNotIn("releases.sasist.pl", release.download_url)

    @patch.object(svc, "_http_get_json")
    def test_env_fallback_when_github_http_error(self, mock_get_json):
        request = httpx.Request("GET", "https://api.github.com/repos/x/y/releases/latest")
        response = httpx.Response(404, request=request)
        mock_get_json.side_effect = httpx.HTTPStatusError("not found", request=request, response=response)

        with patch.object(svc, "AGENT_RELEASE_VERSION", "1.0.0"), patch.object(
            svc,
            "AGENT_DOWNLOAD_URL",
            "https://cdn.example/agent-setup.exe",
        ):
            release = svc.get_latest_printer_agent_release(force_refresh=True)

        self.assertEqual(release.source, "env")

    @patch.object(svc, "_http_get_json")
    def test_cache_avoids_repeated_github_calls(self, mock_get_json):
        mock_get_json.return_value = _github_payload(tag="v1.0.3")

        first = svc.get_latest_printer_agent_release(force_refresh=True)
        second = svc.get_latest_printer_agent_release()

        self.assertEqual(first.version, "1.0.3")
        self.assertEqual(second.version, "1.0.3")
        self.assertTrue(second.cache_hit)
        mock_get_json.assert_called_once()

    @patch.object(svc, "_http_get_json")
    def test_cache_expires_after_ttl(self, mock_get_json):
        mock_get_json.return_value = _github_payload(tag="v1.0.4")
        timeline = {"now": 1000.0}

        with patch.object(svc.time, "monotonic", side_effect=lambda: timeline["now"]):
            svc.get_latest_printer_agent_release(force_refresh=True)
            timeline["now"] += svc.CACHE_TTL_SECONDS + 1
            svc.get_latest_printer_agent_release()

        self.assertEqual(mock_get_json.call_count, 2)

    def test_find_installer_asset_matches_prefix_pattern(self):
        assets = [
            {"name": "readme.txt"},
            {"name": "SasistPrinterAgent-Setup-1.0.1.exe"},
            {"name": "SasistPrinterAgent-Setup-1.0.2.exe"},
        ]
        asset = svc.find_installer_asset(assets, prefix="SasistPrinterAgent-Setup")
        self.assertEqual(asset["name"], "SasistPrinterAgent-Setup-1.0.1.exe")

    def test_normalize_release_version_strips_v_prefix(self):
        self.assertEqual(svc.normalize_release_version("v1.1.0"), "1.1.0")
        self.assertEqual(svc.normalize_release_version("1.1.0"), "1.1.0")

    def test_is_valid_download_url_rejects_releases_sasist_pl(self):
        self.assertFalse(
            svc.is_valid_download_url("https://releases.sasist.pl/printer-agent/SasistPrinterAgent-latest.zip")
        )

    def test_is_valid_download_url_rejects_localhost_in_production(self):
        with patch.object(svc, "is_production_environment", return_value=True):
            self.assertFalse(svc.is_valid_download_url("http://localhost:8010/downloads/setup.exe"))


class GitHubReleaseEndpointTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.auth.deps import get_current_user
        from backend.main import app
        from backend.tests.printing._helpers import user_override
        from fastapi.testclient import TestClient

        app.dependency_overrides[get_current_user] = lambda: user_override()
        cls.client = TestClient(app, raise_server_exceptions=True)

    @classmethod
    def tearDownClass(cls) -> None:
        from backend.auth.deps import get_current_user
        from backend.main import app

        app.dependency_overrides.pop(get_current_user, None)

    def setUp(self) -> None:
        svc.clear_printer_agent_release_cache()

    def tearDown(self) -> None:
        svc.clear_printer_agent_release_cache()

    @patch.object(svc, "_http_get_json")
    def test_download_info_endpoint_uses_github_release(self, mock_get_json):
        mock_get_json.return_value = _github_payload(tag="v1.0.5")

        response = self.client.get("/api/printing/agent/download-info", params={"tenant_id": 1})

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["latest_version"], "1.0.5")
        self.assertEqual(body["source"], "github")
        self.assertIn("SasistPrinterAgent-Setup", body["download_url"])

    @patch.object(svc, "_http_get_json")
    @patch("backend.api.printing.release.is_dev_environment", return_value=True)
    def test_download_debug_endpoint(self, _mock_dev, mock_get_json):
        mock_get_json.return_value = _github_payload(tag="v1.0.6")

        response = self.client.get("/api/printing/agent/download-debug", params={"tenant_id": 1})

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["source"], "github")
        self.assertEqual(body["latest_version"], "1.0.6")
        self.assertIn("github_repository", body)

    @patch("backend.api.printing.release.is_dev_environment", return_value=False)
    def test_download_debug_hidden_in_production(self, _mock_dev):
        response = self.client.get("/api/printing/agent/download-debug", params={"tenant_id": 1})
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
