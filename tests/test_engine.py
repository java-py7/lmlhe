import unittest
from fastapi.testclient import TestClient

import main

class TestProject2Engine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)

    def test_health_endpoint(self):
        resp = self.client.get("/api/v1/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["version"], "1.0.0")
        self.assertIn("active_runtime", data)

    def test_hardware_endpoint(self):
        resp = self.client.get("/api/v1/hardware")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("cpu", data)
        self.assertIn("ram", data)
        self.assertIn("gpu", data)
        self.assertIn("storage", data)
        self.assertGreater(data["cpu"]["physical_cores"], 0)
        self.assertGreater(data["ram"]["total_bytes"], 0)

    def test_runtimes_endpoint(self):
        resp = self.client.get("/api/v1/runtimes")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("llama_cpp", data)
        self.assertIn("ollama", data)

    def test_runtime_status_endpoint(self):
        resp = self.client.get("/api/v1/runtime/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("runtime", data)
        self.assertIn("details", data)

    def test_models_endpoint(self):
        resp = self.client.get("/api/v1/models")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("models", data)
        self.assertIsInstance(data["models"], list)

    def test_config_endpoints(self):
        # GET config
        resp = self.client.get("/api/v1/config")
        self.assertEqual(resp.status_code, 200)
        cfg = resp.json()

        # PUT config
        cfg["llama_cpp"]["threads"] = 4
        put_resp = self.client.put("/api/v1/config", json=cfg)
        self.assertEqual(put_resp.status_code, 200)

    def test_metrics_endpoint(self):
        resp = self.client.get("/api/v1/metrics")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("cpu", data)
        self.assertIn("ram", data)
        self.assertIn("inference", data)

    def test_recommendation_engine(self):
        resp = self.client.post("/api/v1/config/recommend", json={"context_length": 2048})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("recommendations", data)
        self.assertIn("memory_breakdown", data)
        self.assertIn("safety", data)

    def test_inference_stop_endpoint(self):
        resp = self.client.post("/api/v1/inference/stop")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

    def test_project3_generate_endpoint_validation(self):
        resp = self.client.post(
            "/api/v1/inference/generate",
            json={
                "prompt": "Hello",
                "max_tokens": 5,
                "temperature": 0.1,
                "stream": False,
            },
        )
        # Returns 400 when no model selected/available, or 200/503 when model is active
        self.assertIn(resp.status_code, [200, 400, 503])
        if resp.status_code == 200:
            data = resp.json()
            self.assertIn("response", data)
            self.assertIn("metrics", data)

    def test_dynamic_models_discovery_and_directories(self):
        # 1. Test directory addition with valid directory
        resp_add = self.client.post("/api/v1/models/directories", json={"directory_path": "models"})
        self.assertEqual(resp_add.status_code, 200)
        data = resp_add.json()
        self.assertIn("models", data["directories"])

        # 2. Test directory addition with invalid path
        resp_invalid = self.client.post("/api/v1/models/directories", json={"directory_path": "non_existent_folder_xyz"})
        self.assertEqual(resp_invalid.status_code, 400)

        # 3. Test dynamic scan
        resp_scan = self.client.post("/api/v1/models/scan")
        self.assertEqual(resp_scan.status_code, 200)
        scan_data = resp_scan.json()
        self.assertEqual(scan_data["status"], "ok")
        self.assertIn("count", scan_data)

        # 4. Test refresh endpoint
        resp_refresh = self.client.post("/api/v1/models/refresh")
        self.assertEqual(resp_refresh.status_code, 200)
        refresh_data = resp_refresh.json()
        self.assertEqual(refresh_data["status"], "ok")

        # 5. Test add model file with nonexistent path
        resp_fake_model = self.client.post("/api/v1/models/add", json={"path": "models/nonexistent.gguf"})
        self.assertEqual(resp_fake_model.status_code, 400)

        # 6. Test delete model with nonexistent id
        resp_del = self.client.delete("/api/v1/models/nonexistent_id_xyz")
        self.assertEqual(resp_del.status_code, 404)

        # 7. Test directory removal
        resp_del_dir = self.client.request("DELETE", "/api/v1/models/directories", json={"directory_path": "non_existent_folder_xyz"})
        self.assertEqual(resp_del_dir.status_code, 200)

    def test_evaluations_endpoints(self):
        # 1. GET /api/v1/evaluations
        resp = self.client.get("/api/v1/evaluations")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("evaluations", data)

        # 2. POST /api/v1/evaluations/run (test with single task for fast test execution)
        eval_req = {
            "test_suite": ["instruction_following"]
        }
        run_resp = self.client.post("/api/v1/evaluations/run", json=eval_req)
        self.assertEqual(run_resp.status_code, 200)
        eval_record = run_resp.json()
        self.assertIn("id", eval_record)
        self.assertIn("composite_score", eval_record)
        self.assertIn("tasks", eval_record)
        self.assertEqual(len(eval_record["tasks"]), 1)

        eval_id = eval_record["id"]

        # 3. POST /api/v1/evaluations/{id}/rating
        rating_req = {
            "rating": 9.0,
            "feedback": "Test human validation review",
            "evaluator": "AutomatedTest"
        }
        rate_resp = self.client.post(f"/api/v1/evaluations/{eval_id}/rating", json=rating_req)
        self.assertEqual(rate_resp.status_code, 200)
        self.assertEqual(rate_resp.json()["evaluation"]["human_rating"], 9.0)

    def test_runtime_adapters_and_status(self):
        # 1. GET /api/v1/runtimes
        resp = self.client.get("/api/v1/runtimes")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("adapters", data)
        adapters = data["adapters"]
        self.assertIn("ollama", adapters)
        self.assertIn("llama.cpp server", adapters)
        self.assertIn("transformers", adapters)
        self.assertIn("onnxruntime", adapters)
        self.assertIn("mlx", adapters)

        # 2. GET /api/v1/runtimes/ollama/status
        ollama_resp = self.client.get("/api/v1/runtimes/ollama/status")
        self.assertEqual(ollama_resp.status_code, 200)
        self.assertEqual(ollama_resp.json()["runtime_id"], "ollama")

        # 3. GET invalid runtime
        invalid_resp = self.client.get("/api/v1/runtimes/nonexistent_runtime_xyz/status")
        self.assertEqual(invalid_resp.status_code, 404)

    def test_model_download(self):
        # 1. POST /api/v1/models/download without license confirmation
        down_req = {
            "source_url": "https://huggingface.co/test/model.gguf",
            "destination_filename": "test_model.gguf",
            "expected_size_bytes": 1024 * 1024 * 100,
            "license_confirmed": False
        }
        down_resp = self.client.post("/api/v1/models/download", json=down_req)
        self.assertEqual(down_resp.status_code, 400)
        self.assertIn("license", down_resp.json()["detail"].lower())

        # 3. POST /api/v1/models/download with license confirmation
        down_req["license_confirmed"] = True
        down_resp2 = self.client.post("/api/v1/models/download", json=down_req)
        self.assertEqual(down_resp2.status_code, 200)
        self.assertTrue(down_resp2.json()["validation"]["space_check_passed"])

    def test_advisor_hardware_summary(self):
        resp = self.client.get("/api/v1/advisor/hardware-summary")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("cpu", data)
        self.assertIn("ram", data)
        self.assertIn("gpu", data)
        self.assertIn("max_safe_model_bytes", data)
        self.assertGreater(data["ram"]["available_bytes"], 0)
        self.assertGreater(data["cpu"]["physical_cores"], 0)

    def test_advisor_recommendations_workloads_and_tiers(self):
        # 1. Test coding workload
        resp = self.client.post("/api/v1/advisor/recommendations", json={
            "workload": "coding",
            "preference": "balanced",
            "catalog_source": "all"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("counts_by_tier", data)
        self.assertIn("recommendations", data)
        self.assertGreater(len(data["recommendations"]), 0)

        # Verify 5 tiers valid
        valid_tiers = {"RECOMMENDED", "GOOD_ALTERNATIVE", "EXPERIMENTAL", "NOT_RECOMMENDED", "UNSUPPORTED"}
        for m in data["recommendations"]:
            self.assertIn(m["recommendation_tier"], valid_tiers)
            self.assertIn("selected_quantization", m)
            self.assertIn("memory_breakdown", m)
            self.assertIn("technical_rationale", m)
            self.assertIn("estimated_performance", m)

        # 2. Test lowest_memory preference
        resp_mem = self.client.post("/api/v1/advisor/recommendations", json={
            "workload": "general",
            "preference": "lowest_memory"
        })
        self.assertEqual(resp_mem.status_code, 200)
        top_model = resp_mem.json()["recommendations"][0]
        self.assertIn(top_model["recommendation_tier"], ["RECOMMENDED", "GOOD_ALTERNATIVE"])

    def test_advisor_runtime_install_guide(self):
        # 1. llama.cpp guide
        resp = self.client.get("/api/v1/advisor/runtimes/install-guide/llama.cpp%20server")
        self.assertEqual(resp.status_code, 200)
        guide = resp.json()["guide"]
        self.assertEqual(guide["runtime_id"], "llama.cpp server")
        self.assertIn("one_click_commands", guide)
        self.assertIn("install_instructions", guide)

        # 2. ollama guide
        resp_ollama = self.client.get("/api/v1/advisor/runtimes/install-guide/ollama")
        self.assertEqual(resp_ollama.status_code, 200)

        # 3. invalid runtime
        resp_inv = self.client.get("/api/v1/advisor/runtimes/install-guide/nonexistent_xyz")
        self.assertEqual(resp_inv.status_code, 404)

    def test_advisor_setup_pipeline_lifecycle(self):
        # 1. License unconfirmed must fail with 400
        req_unconfirmed = {
            "model_id": "qwen2.5-0.5b-instruct",
            "license_confirmed": False
        }
        resp = self.client.post("/api/v1/advisor/setup", json=req_unconfirmed)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("license", resp.json()["detail"].lower())

        # 2. License confirmed initiates setup
        req_confirmed = {
            "model_id": "qwen2.5-0.5b-instruct",
            "quantization": "Q4_K_M",
            "filename": "test_qwen_0_5b.gguf",
            "expected_size_bytes": 1024 * 1024 * 50,  # 50 MB
            "license_confirmed": True,
            "auto_configure": True,
            "run_verification": False
        }
        setup_resp = self.client.post("/api/v1/advisor/setup", json=req_confirmed)
        self.assertEqual(setup_resp.status_code, 200)
        task_id = setup_resp.json()["task_id"]
        self.assertTrue(task_id.startswith("setup_"))

        # 3. Query progress
        prog_resp = self.client.get(f"/api/v1/advisor/setup/{task_id}/progress")
        self.assertEqual(prog_resp.status_code, 200)
        self.assertIn("status", prog_resp.json())
        self.assertIn("progress_percent", prog_resp.json())

        # 4. Cancel setup
        cancel_resp = self.client.post(f"/api/v1/advisor/setup/{task_id}/cancel")
        self.assertEqual(cancel_resp.status_code, 200)
        self.assertEqual(cancel_resp.json()["status"], "cancelling")

    def test_model_selection_runtime_switching(self):
        # 1. Select Ollama model -> runtime auto-switches to 'ollama'
        resp_ollama = self.client.post("/api/v1/models/select", json={"model_id": "ollama_llama3_2_1b"})
        if resp_ollama.status_code == 200:
            data = resp_ollama.json()
            self.assertEqual(data["active_runtime"], "ollama")
            cfg = main.load_config()
            self.assertEqual(cfg.active_runtime, "ollama")

        # 2. Select GGUF model -> runtime auto-switches to 'llama.cpp server'
        resp_gguf = self.client.post("/api/v1/models/select", json={"model_id": "qwen3_5-4b-q4_k_m"})
        if resp_gguf.status_code == 200:
            data = resp_gguf.json()
            self.assertEqual(data["active_runtime"], "llama.cpp server")
            cfg = main.load_config()
            self.assertEqual(cfg.active_runtime, "llama.cpp server")

    def test_ollama_inference_bypasses_llama_server_check(self):
        # Ensure llama-server is NOT running
        main.llama_manager.stop()
        self.assertFalse(main.llama_manager.is_running())

        # Select Ollama model
        sel_resp = self.client.post("/api/v1/models/select", json={"model_id": "ollama_llama3_2_1b"})
        if sel_resp.status_code == 200:
            # Calling generate or chat should NOT return "llama.cpp server is not currently running"
            gen_resp = self.client.post(
                "/api/v1/inference/generate",
                json={"prompt": "Hi", "max_tokens": 5, "stream": False}
            )
            self.assertNotEqual(
                gen_resp.json().get("detail", ""),
                "llama.cpp server is not currently running. Start the server from Runtimes tab or API before requesting inference."
            )

    def test_add_model_path_resolution_spaces_and_removal(self):
        from pathlib import Path
        test_dir = main.BASE_DIR / "models"
        test_dir.mkdir(parents=True, exist_ok=True)
        dummy_file = test_dir / "test sample model spaces.gguf"
        # Write GGUF magic header 'GGUF' + version 3
        with open(dummy_file, "wb") as f:
            f.write(b"GGUF\x03\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00")

        try:
            # 1. Register with absolute path containing spaces and quotes
            quoted_path = f'"{dummy_file}"'
            add_resp = self.client.post("/api/v1/models/add", json={"path": quoted_path})
            self.assertEqual(add_resp.status_code, 200)
            data = add_resp.json()
            model_id = data["model"]["id"]

            # 2. Verify model in catalog
            cat_resp = self.client.get(f"/api/v1/models/{model_id}")
            self.assertEqual(cat_resp.status_code, 200)

            # 3. Remove model from registry via DELETE
            del_resp = self.client.delete(f"/api/v1/models/{model_id}")
            self.assertEqual(del_resp.status_code, 200)

            # 4. Confirm model is removed from catalog
            cat_resp_after = self.client.get(f"/api/v1/models/{model_id}")
            self.assertEqual(cat_resp_after.status_code, 404)

            # 5. Crucially: ensure file remains on disk!
            self.assertTrue(dummy_file.is_file(), "Removing model from registry must never delete file on disk!")

        finally:
            if dummy_file.exists():
                dummy_file.unlink()

    def test_unified_runtimes_start_stop(self):
        # Test unified start/stop endpoints
        resp_start = self.client.post("/api/v1/runtimes/start")
        self.assertIn(resp_start.status_code, [200, 400, 503])
        resp_stop = self.client.post("/api/v1/runtimes/stop")
        self.assertEqual(resp_stop.status_code, 200)

if __name__ == "__main__":
    unittest.main()
