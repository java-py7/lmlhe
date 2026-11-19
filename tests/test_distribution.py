import unittest
from fastapi.testclient import TestClient
import main
from engine import BASE_DIR

class TestAgentDistribution(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_get_agent_installers(self):
        res = self.client.get("/api/v1/agent/installers")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("installers", data)
        
        installers = data["installers"]
        self.assertIn("windows", installers)
        self.assertIn("linux", installers)
        self.assertIn("macos", installers)
        
        # Windows package check
        win = installers["windows"]
        self.assertEqual(win["os"], "Windows")
        self.assertTrue(win["available"])
        self.assertEqual(win["filename"], "LMLHE-Local-Agent-Windows-x64.zip")
        self.assertEqual(win["download_url"], "/api/v1/agent/download/windows")
        self.assertTrue(win.get("auto_start", False))
        self.assertIsInstance(win.get("instructions"), list)
        
        # Linux & macOS coming soon checks (Requirement 9: Honest UX, no fake download buttons)
        linux = installers["linux"]
        self.assertEqual(linux["os"], "Linux")
        self.assertFalse(linux["available"])
        self.assertEqual(linux.get("status"), "coming_soon")
        self.assertEqual(linux.get("badge"), "COMING SOON")

        mac = installers["macos"]
        self.assertEqual(mac["os"], "macOS")
        self.assertFalse(mac["available"])
        self.assertEqual(mac.get("status"), "coming_soon")
        self.assertEqual(mac.get("badge"), "COMING SOON")

    def test_download_windows_package(self):
        res = self.client.get("/api/v1/agent/download/windows")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "application/zip")
        self.assertIn("LMLHE-Local-Agent-Windows-x64.zip", res.headers.get("content-disposition", ""))
        self.assertGreater(len(res.content), 1000000)  # > 1MB (actual is ~41MB)

    def test_download_linux_and_mac_coming_soon(self):
        res_linux = self.client.get("/api/v1/agent/download/linux")
        self.assertEqual(res_linux.status_code, 404)
        self.assertIn("coming soon", res_linux.json().get("detail", "").lower())

        res_mac = self.client.get("/api/v1/agent/download/macos")
        self.assertEqual(res_mac.status_code, 404)
        self.assertIn("coming soon", res_mac.json().get("detail", "").lower())

    def test_direct_downloads_mount(self):
        res = self.client.get("/downloads/LMLHE-Local-Agent-Windows-x64.zip")
        self.assertEqual(res.status_code, 200)
        self.assertIn("zip", res.headers.get("content-type", "").lower())

    def test_local_agent_endpoints_defined(self):
        import local_agent
        agent_client = TestClient(local_agent.app)
        
        status_res = agent_client.get("/api/v1/agent/status")
        self.assertEqual(status_res.status_code, 200)
        status_data = status_res.json()
        self.assertEqual(status_data["status"], "ok")
        self.assertIn(status_data["service"], ["lmlhe-local-agent", "Large-Model-on-Light-Hardware Local PC Agent"])
        self.assertTrue(status_data["connected"])
        self.assertIn("quick_spec", status_data)
        
        quick = status_data["quick_spec"]
        self.assertIn("cpu", quick)
        self.assertIn("ram_total_gb", quick)
        self.assertIn("gpu", quick)

if __name__ == "__main__":
    unittest.main()
