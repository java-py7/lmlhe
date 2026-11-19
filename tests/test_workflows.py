import unittest
from pathlib import Path
from fastapi.testclient import TestClient

import main

class TestWorkflowVerifications(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)

    def test_workflow_4_and_5_ollama_selection_and_generation_without_llama_server(self):
        """Workflow 4 & 5: Select Ollama model -> Ollama is used; Generate response without starting llama.cpp."""
        # Ensure llama-server is stopped
        main.llama_manager.stop()
        self.assertFalse(main.llama_manager.is_running())

        # Select Ollama model
        sel_res = self.client.post("/api/v1/models/select", json={"model_id": "ollama_llama3_2_1b"})
        self.assertEqual(sel_res.status_code, 200)
        self.assertEqual(sel_res.json()["active_runtime"], "ollama")
        cfg = main.load_config()
        self.assertEqual(cfg.active_runtime, "ollama")

        # Generate response using Ollama without starting llama.cpp
        gen_res = self.client.post(
            "/api/v1/inference/generate",
            json={"prompt": "Say hello in 3 words", "max_tokens": 5, "stream": False}
        )
        self.assertEqual(gen_res.status_code, 200, f"Generate failed: {gen_res.text}")
        data = gen_res.json()
        self.assertEqual(data["runtime"], "ollama")
        self.assertIn("response", data)
        self.assertGreater(len(data["response"]), 0)

    def test_workflow_6_select_gguf_model(self):
        """Workflow 6: Select GGUF model -> compatible llama.cpp runtime used."""
        sel_gguf = self.client.post("/api/v1/models/select", json={"model_id": "qwen3_5-4b-q4_k_m"})
        self.assertEqual(sel_gguf.status_code, 200)
        self.assertEqual(sel_gguf.json()["active_runtime"], "llama.cpp server")
        cfg = main.load_config()
        self.assertEqual(cfg.active_runtime, "llama.cpp server")

    def test_workflow_7_register_via_file_picker_filename(self):
        """Workflow 7: Register existing model using file picker filename."""
        models_dir = main.BASE_DIR / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        sample = models_dir / "picker_sample_model.gguf"
        with open(sample, "wb") as f:
            f.write(b"GGUF\x03\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00")
        try:
            # File picker sends filename alone or fakepath
            pick_res = self.client.post("/api/v1/models/add", json={"path": "C:\\fakepath\\picker_sample_model.gguf"})
            self.assertEqual(pick_res.status_code, 200)
            m_id = pick_res.json()["model"]["id"]
            self.assertEqual(pick_res.json()["model"]["file_name"], "picker_sample_model.gguf")

            # Clean up
            self.client.delete(f"/api/v1/models/{m_id}")
        finally:
            if sample.exists():
                sample.unlink()

    def test_workflow_8_register_model_absolute_path_with_spaces_and_quotes(self):
        """Workflow 8: Register model using absolute path containing spaces."""
        models_dir = main.BASE_DIR / "models"
        models_dir.mkdir(parents=True, exist_ok=True)
        spaced_file = models_dir / "test sample spaced model.gguf"
        with open(spaced_file, "wb") as f:
            f.write(b"GGUF\x03\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00")
        try:
            # Path with spaces and surrounding double quotes
            quoted = f'"{spaced_file}"'
            add_res = self.client.post("/api/v1/models/add", json={"path": quoted})
            self.assertEqual(add_res.status_code, 200)
            m_id = add_res.json()["model"]["id"]

            # Workflow 9: Refresh model catalog -> entries remain correct
            ref_res = self.client.post("/api/v1/models/refresh")
            self.assertEqual(ref_res.status_code, 200)
            ids = [m["id"] for m in ref_res.json()["models"]]
            self.assertIn(m_id, ids)

            # Workflow 3: Remove model using X button -> disappears from registry, file remains on disk
            del_res = self.client.delete(f"/api/v1/models/{m_id}")
            self.assertEqual(del_res.status_code, 200)

            # Verify disappeared from registry
            get_res = self.client.get(f"/api/v1/models/{m_id}")
            self.assertEqual(get_res.status_code, 404)

            # Verify file remains on disk
            self.assertTrue(spaced_file.is_file(), "Removing model entry from registry must NEVER delete the file on disk!")

        finally:
            if spaced_file.exists():
                spaced_file.unlink()

    def test_workflow_10_switch_between_ollama_and_llama_models(self):
        """Workflow 10: Switch between Ollama and llama.cpp models -> Inference Studio follows selection."""
        # Switch to Ollama model
        res1 = self.client.post("/api/v1/models/select", json={"model_id": "ollama_llama3_2_1b"})
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["active_runtime"], "ollama")
        cfg1 = main.load_config()
        self.assertEqual(cfg1.active_runtime, "ollama")

        # Switch to llama.cpp model
        res2 = self.client.post("/api/v1/models/select", json={"model_id": "qwen3_5-4b-q4_k_m"})
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["active_runtime"], "llama.cpp server")
        cfg2 = main.load_config()
        self.assertEqual(cfg2.active_runtime, "llama.cpp server")

if __name__ == "__main__":
    unittest.main()
