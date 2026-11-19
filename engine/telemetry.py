import threading
import time
from typing import Any, Dict, Optional

from engine.hardware import SystemSampler


class InferenceTelemetry:
    def __init__(self):
        self._lock = threading.Lock()
        self.state = "idle"
        self.model = "None"
        self.runtime = "None"
        self.tokens_generated = 0
        self.time_to_first_token_sec: Optional[float] = None
        self.tokens_per_second: float = 0.0
        self.prompt_eval_tokens_per_second: float = 0.0
        self.last_duration_sec: float = 0.0
        self.error_message: Optional[str] = None
        self.generation_start_time: float = 0.0

    def start_generation(self, model: str, runtime: str):
        with self._lock:
            self.state = "generating"
            self.model = model
            self.runtime = runtime
            self.tokens_generated = 0
            self.time_to_first_token_sec = None
            self.tokens_per_second = 0.0
            self.prompt_eval_tokens_per_second = 0.0
            self.last_duration_sec = 0.0
            self.error_message = None
            self.generation_start_time = time.time()

    def record_first_token(self):
        with self._lock:
            if self.time_to_first_token_sec is None:
                self.time_to_first_token_sec = max(0.001, time.time() - self.generation_start_time)

    def record_tokens(self, count: int):
        with self._lock:
            self.tokens_generated += count
            elapsed = time.time() - self.generation_start_time
            if self.time_to_first_token_sec and elapsed > self.time_to_first_token_sec:
                gen_time = elapsed - self.time_to_first_token_sec
                if gen_time > 0:
                    self.tokens_per_second = round(self.tokens_generated / gen_time, 2)

    def finish_generation(self, error: Optional[str] = None):
        with self._lock:
            self.last_duration_sec = round(time.time() - self.generation_start_time, 2)
            if error:
                self.state = "error"
                self.error_message = error
            else:
                self.state = "idle"
                if self.time_to_first_token_sec and self.last_duration_sec > self.time_to_first_token_sec:
                    gen_time = self.last_duration_sec - self.time_to_first_token_sec
                    if gen_time > 0 and self.tokens_generated > 0:
                        self.tokens_per_second = round(self.tokens_generated / gen_time, 2)
                        SystemSampler.record_throughput(self.tokens_per_second)

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "state": self.state,
                "model": self.model,
                "runtime": self.runtime,
                "tokens_generated": self.tokens_generated,
                "time_to_first_token_sec": round(self.time_to_first_token_sec, 3) if self.time_to_first_token_sec else None,
                "tokens_per_second": self.tokens_per_second,
                "prompt_eval_tokens_per_second": self.prompt_eval_tokens_per_second,
                "last_duration_sec": self.last_duration_sec,
                "error_message": self.error_message,
            }


telemetry = InferenceTelemetry()
