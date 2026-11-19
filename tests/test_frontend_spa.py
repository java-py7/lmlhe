import unittest
from fastapi.testclient import TestClient
from main import app

class TestFrontendSPA(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root_index_html(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn('<div id="root">', res.text)
        self.assertIn("/assets/", res.text)

    def test_spa_client_routes(self):
        spa_routes = [
            "/advisor",
            "/hardware",
            "/runtimes",
            "/inference",
            "/monitor",
            "/benchmarks",
            "/diagnostics",
            "/api-config",
            "/deployment",
        ]
        for route in spa_routes:
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Route {route} failed")
            self.assertIn('<div id="root">', res.text)

    def test_legacy_asset_fallbacks(self):
        self.assertEqual(self.client.get("/style.css").status_code, 200)
        self.assertEqual(self.client.get("/script.js").status_code, 200)
        self.assertIn(self.client.get("/favicon.ico").status_code, [200, 204])

    def test_api_routes_not_shadowed(self):
        res_health = self.client.get("/api/v1/health")
        self.assertEqual(res_health.status_code, 200)
        self.assertEqual(res_health.json().get("status"), "healthy")

        res_404 = self.client.get("/api/v1/nonexistent_route_test")
        self.assertEqual(res_404.status_code, 404)

if __name__ == "__main__":
    unittest.main()
