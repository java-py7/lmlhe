import json
import unittest
from fastapi.testclient import TestClient
from main import app
import engine

client = TestClient(app)

class TestRuntimeSelection(unittest.TestCase):
    def test_01_select_ollama_model(self):
        res = client.post("/api/v1/models/select", json={"model_id": "ollama_llama3_2_1b"})
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertEqual(d["active_runtime"], "ollama")
        
        # Check /api/v1/runtimes
        res_rt = client.get("/api/v1/runtimes")
        self.assertEqual(res_rt.status_code, 200)
        self.assertEqual(res_rt.json()["active_runtime"], "ollama")

    def test_02_select_gguf_model(self):
        res = client.post("/api/v1/models/select", json={"model_id": "qwen3_5-4b-q4_k_m"})
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertEqual(d["active_runtime"], "llama.cpp server")

    def test_03_stale_config_reconciliation(self):
        # Write conflicting config directly
        with open("storage/config.json", "r", encoding="utf-8") as f:
            cfg_data = json.load(f)
        cfg_data["active_model_id"] = "ollama_llama3_2_1b"
        cfg_data["active_runtime"] = "llama.cpp server"  # Conflicting!
        with open("storage/config.json", "w", encoding="utf-8") as f:
            json.dump(cfg_data, f, indent=2)

        # load_config must reconcile
        reconciled_cfg = engine.load_config()
        self.assertEqual(reconciled_cfg.active_runtime, "ollama")

    def test_04_start_ollama_model_never_launches_llama_server(self):
        # Set active model to ollama
        client.post("/api/v1/models/select", json={"model_id": "ollama_llama3_2_1b"})
        
        # Direct call to /api/v1/runtimes/llama/start must route to ollama, not 400
        res = client.post("/api/v1/runtimes/llama/start", json={})
        self.assertIn(res.status_code, (200, 503))
        self.assertNotIn("is not compatible with llama.cpp", res.text)

    def test_05_chat_completion_uses_ollama_for_ollama_model(self):
        # Calling chat completions with ollama model
        res = client.post("/v1/chat/completions", json={
            "model": "ollama_llama3_2_1b",
            "messages": [{"role": "user", "content": "Hello!"}],
            "max_tokens": 10,
        })
        self.assertIn(res.status_code, (200, 503))
        self.assertNotIn("llama.cpp server is not currently running", res.text)

if __name__ == "__main__":
    unittest.main()
