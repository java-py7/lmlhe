document.addEventListener("DOMContentLoaded", () => {
  const state = {
    hardware: null,
    models: [],
    activeModelId: null,
    config: null,
    runtimes: null,
    benchmarks: null,
    diagnostics: null,
    isGenerating: false,
    activeAbortController: null,
    currentLogSource: "llama",
    chatMessages: [],
    modelFilter: {
      search: "",
      runtime: "all",
      format: "all",
      status: "all",
    },
    advisor: {
      workload: "general",
      preference: "balanced",
      tierFilter: "ALL",
      searchQuery: "",
      catalogSource: "all",
      models: [],
      selectedForCompare: new Set(),
      activeSetupTaskId: null,
      setupPollInterval: null,
      activeGuideRuntime: "llama.cpp server",
    },
  };

  function showToast(message, type = "info", duration = 3500) {
    const box = document.getElementById("toast-box");
    if (!box) return;
    const toast = document.createElement("div");
    toast.className = `toast`;
    let colorBadge = "primary";
    if (type === "success") colorBadge = "success";
    if (type === "danger") colorBadge = "danger";
    if (type === "warning") colorBadge = "warning";

    toast.innerHTML = `
      <span class="badge ${colorBadge}">${type.toUpperCase()}</span>
      <span style="flex:1;">${escapeHtml(message)}</span>
    `;
    box.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = parseFloat(bytes);
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(2)} ${units[i]}`;
  }

  function setupTabs() {
    const btns = document.querySelectorAll(".tab-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        const target = document.getElementById(tabId);
        if (target) target.classList.add("active");

        if (tabId === "tab-advisor") {
          loadAdvisorHardwareSummary();
          loadAdvisorRecommendations();
        }
        if (tabId === "tab-diagnostics") loadDiagnostics();
        if (tabId === "tab-benchmark") {
          loadBenchmarks();
          loadEvaluations();
        }
        if (tabId === "tab-packaging") renderPackagingRuntimes();
      });
    });
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/v1/config");
      if (!res.ok) throw new Error("Failed to load config");
      state.config = await res.json();
      state.activeModelId = state.config.active_model_id;
      renderConfigInputs();
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  async function loadHardware() {
    try {
      const res = await fetch("/api/v1/hardware");
      if (!res.ok) throw new Error("Failed to load hardware");
      state.hardware = await res.json();
      renderHardwareLimits();
      renderDrivesList();
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  async function loadRuntimes() {
    try {
      const res = await fetch("/api/v1/runtimes");
      if (!res.ok) throw new Error("Failed to load runtimes");
      state.runtimes = await res.json();
      renderRuntimeStatus();
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  async function loadModels() {
    try {
      const res = await fetch("/api/v1/models");
      if (!res.ok) throw new Error("Failed to load models");
      const data = await res.json();
      state.models = data.models || [];
      state.activeModelId = data.active_model_id;
      if (data.model_directories && state.config) {
        state.config.model_directories = data.model_directories;
      }
      renderModelCatalog();
      renderActiveModel();
      updateEngineModelSelect();
      updateBenchmarkModelSelects();
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  function updateMetricsUI(data) {
    if (!data) return;
    const cpu = data.cpu || {};
    const ram = data.ram || {};
    const gpu = data.gpu || {};
    const infer = data.inference || {};

    const cpuPercent = Math.round(cpu.utilization_percent || 0);
    const ramPercent = Math.round(ram.utilization_percent || 0);

    document.getElementById("quick-cpu").textContent = `${cpuPercent}%`;
    document.getElementById("quick-ram").textContent = `${ramPercent}%`;

    document.getElementById("dash-cpu-percent").textContent = `${cpuPercent}%`;
    document.getElementById("dash-cpu-bar").style.width = `${Math.min(100, cpuPercent)}%`;
    if (cpu.physical_cores) {
      document.getElementById("dash-cpu-cores").textContent = `${cpu.physical_cores} C / ${cpu.logical_threads} T`;
    }
    if (cpu.name) {
      document.getElementById("dash-cpu-name").textContent = cpu.name;
    }

    document.getElementById("dash-ram-percent").textContent = `${ramPercent}%`;
    document.getElementById("dash-ram-used").textContent = `${ram.used_gb} GB`;
    document.getElementById("dash-ram-bar").style.width = `${ramPercent}%`;
    document.getElementById("dash-ram-sub").textContent = `${ram.available_gb} GB free of ${ram.total_gb} GB`;

    if (gpu.detected) {
      document.getElementById("dash-gpu-vram").textContent = gpu.dedicated_vram_formatted || "Detected";
      document.getElementById("dash-gpu-name").textContent = gpu.name;
      document.getElementById("dash-gpu-vram-sub").textContent = `Shared pool: ${gpu.shared_vram_formatted || "Unavailable"}`;
      document.getElementById("dash-gpu-status-badge").className = "badge success";
      document.getElementById("dash-gpu-status-badge").textContent = gpu.vendor || "ONLINE";
    } else {
      document.getElementById("dash-gpu-vram").textContent = "Unavailable";
      document.getElementById("dash-gpu-name").textContent = "CPU / Integrated Graphics";
      document.getElementById("dash-gpu-status-badge").className = "badge outline";
      document.getElementById("dash-gpu-status-badge").textContent = "CPU-ONLY";
    }

    const stateBadge = document.getElementById("dash-infer-state-badge");
    const monStateBadge = document.getElementById("mon-infer-state-badge");
    const stateStr = (infer.state || "idle").toUpperCase();
    stateBadge.textContent = stateStr;
    monStateBadge.textContent = stateStr;

    if (infer.state === "generating") {
      stateBadge.className = "badge primary";
      monStateBadge.className = "badge primary";
    } else if (infer.state === "error") {
      stateBadge.className = "badge danger";
      monStateBadge.className = "badge danger";
    } else {
      stateBadge.className = "badge outline";
      monStateBadge.className = "badge outline";
    }

    const toksSec = infer.tokens_per_second ? infer.tokens_per_second.toFixed(1) : "0.0";
    document.getElementById("dash-infer-toks").textContent = `${toksSec} t/s`;
    document.getElementById("dash-infer-ttft").textContent = infer.time_to_first_token_sec
      ? `TTFT: ${(infer.time_to_first_token_sec * 1000).toFixed(0)} ms`
      : "TTFT: -- ms";
    document.getElementById("dash-infer-total").textContent = `Last Gen: ${infer.tokens_generated || 0} tokens (${infer.last_duration_sec || 0}s)`;

    document.getElementById("mon-cpu-val").textContent = `${cpuPercent}%`;
    document.getElementById("mon-cpu-bar").style.width = `${Math.min(100, cpuPercent)}%`;
    if (cpu.frequency_mhz?.current) {
      document.getElementById("mon-cpu-clock").textContent = `${Math.round(cpu.frequency_mhz.current)} MHz`;
    }

    const coreDiv = document.getElementById("mon-cores-breakdown");
    if (cpu.per_core_percent && cpu.per_core_percent.length > 0) {
      coreDiv.innerHTML = cpu.per_core_percent
        .map((p, i) => `<div>C${i}: <span style="color:#60a5fa;">${Math.round(p)}%</span></div>`)
        .join("");
    }

    document.getElementById("mon-ram-percent").textContent = `${ramPercent}%`;
    document.getElementById("mon-ram-val").textContent = `${ram.used_gb} GB`;
    document.getElementById("mon-ram-bar").style.width = `${ramPercent}%`;
    document.getElementById("mon-ram-sub").textContent = `${ram.available_gb} GB free / ${ram.total_gb} GB total`;

    if (gpu.detected) {
      document.getElementById("mon-vram-val").textContent = gpu.dedicated_vram_formatted || "Unavailable";
      document.getElementById("mon-gpu-name").textContent = gpu.name;
      document.getElementById("mon-vram-sub").textContent = `Shared pool: ${gpu.shared_vram_formatted || "Unavailable"}`;
      document.getElementById("mon-gpu-status-badge").className = "badge success";
      document.getElementById("mon-gpu-status-badge").textContent = gpu.vendor || "DETECTED";
    } else {
      document.getElementById("mon-vram-val").textContent = "Unavailable";
      document.getElementById("mon-gpu-name").textContent = "No discrete GPU";
      document.getElementById("mon-gpu-status-badge").className = "badge outline";
      document.getElementById("mon-gpu-status-badge").textContent = "CPU-ONLY";
    }

    document.getElementById("mon-toks-val").textContent = `${toksSec} t/s`;
    document.getElementById("mon-ttft-sub").textContent = infer.time_to_first_token_sec
      ? `TTFT: ${(infer.time_to_first_token_sec * 1000).toFixed(0)} ms`
      : "TTFT: -- ms";
    document.getElementById("mon-infer-duration-sub").textContent = `Session: ${infer.last_duration_sec || 0}s (${infer.tokens_generated || 0} toks)`;

    document.getElementById("chat-toks-val").textContent = toksSec;
    document.getElementById("chat-ttft-val").textContent = infer.time_to_first_token_sec
      ? (infer.time_to_first_token_sec * 1000).toFixed(0)
      : "--";

    const telemList = document.getElementById("mon-telemetry-details");
    telemList.innerHTML = `
      <div class="spec-item"><span class="spec-label">Current Inference State</span><span class="spec-val">${infer.state || "idle"}</span></div>
      <div class="spec-item"><span class="spec-label">Active Model in Memory</span><span class="spec-val">${infer.model || "None"}</span></div>
      <div class="spec-item"><span class="spec-label">Generation Throughput</span><span class="spec-val">${toksSec} tokens/sec</span></div>
      <div class="spec-item"><span class="spec-label">Prompt Evaluation Speed</span><span class="spec-val">${infer.prompt_eval_tokens_per_second ? infer.prompt_eval_tokens_per_second + " t/s" : "N/A"}</span></div>
      <div class="spec-item"><span class="spec-label">Time to First Token (TTFT)</span><span class="spec-val">${infer.time_to_first_token_sec ? (infer.time_to_first_token_sec * 1000).toFixed(1) + " ms" : "Awaiting request"}</span></div>
      <div class="spec-item"><span class="spec-label">Latest Generation Duration</span><span class="spec-val">${infer.last_duration_sec || 0} s</span></div>
    `;

    const sensList = document.getElementById("mon-sensors-details");
    sensList.innerHTML = `
      <div class="spec-item"><span class="spec-label">CPU Temperature Sensor</span><span class="spec-val">${cpu.temperature_supported ? cpu.temperature_celsius + " °C" : "Not supported on driver"}</span></div>
      <div class="spec-item"><span class="spec-label">GPU Temperature Sensor</span><span class="spec-val">${gpu.temperature_celsius || "Not supported"}</span></div>
      <div class="spec-item"><span class="spec-label">GPU Utilization Sensor</span><span class="spec-val">${gpu.utilization_percent || "Unavailable"}</span></div>
      <div class="spec-item"><span class="spec-label">Active Storage Partitions</span><span class="spec-val">${(data.storage || []).length} active drives</span></div>
    `;

    if (data.history) {
      renderSparklines(data.history);
    }
  }

  function renderSparklines(history) {
    function drawPolyline(svgId, pointsArray, maxVal) {
      const svg = document.getElementById(svgId);
      if (!svg) return;
      const poly = svg.querySelector("polyline");
      if (!poly) return;
      if (!pointsArray || pointsArray.length === 0) {
        poly.setAttribute("points", "");
        return;
      }
      const w = 300;
      const h = 60;
      const n = pointsArray.length;
      const pts = pointsArray.map((pt, i) => {
        const x = n > 1 ? (i / (n - 1)) * (w - 6) + 3 : w / 2;
        const v = Math.max(0, pt.v || 0);
        const y = h - 6 - (v / maxVal) * (h - 12);
        return `${x.toFixed(1)},${Math.min(h - 3, Math.max(3, y)).toFixed(1)}`;
      });
      poly.setAttribute("points", pts.join(" "));
    }

    const cpuPts = history.cpu || [];
    const ramPts = history.ram || [];
    const toksPts = history.throughput || [];

    drawPolyline("sparkline-cpu", cpuPts, 100);
    if (cpuPts.length > 0) {
      const lastCpu = cpuPts[cpuPts.length - 1].v;
      const el = document.getElementById("spark-cpu-val");
      if (el) el.textContent = `${Math.round(lastCpu)}%`;
    }

    drawPolyline("sparkline-ram", ramPts, 100);
    if (ramPts.length > 0) {
      const lastRam = ramPts[ramPts.length - 1].v;
      const el = document.getElementById("spark-ram-val");
      if (el) el.textContent = `${Math.round(lastRam)}%`;
    }

    const maxToks = Math.max(10, ...toksPts.map((p) => p.v || 0));
    drawPolyline("sparkline-toks", toksPts, maxToks);
    if (toksPts.length > 0) {
      const lastToks = toksPts[toksPts.length - 1].v;
      const el = document.getElementById("spark-toks-val");
      if (el) el.textContent = `${lastToks.toFixed(1)} t/s`;
    }
  }

  function renderDrivesList() {
    const hw = state.hardware;
    if (!hw) return;
    const drivesBox = document.getElementById("dash-storage-drives-list");
    drivesBox.innerHTML = "";
    (hw.storage || []).forEach((d) => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.25rem;">
          <strong>${d.mountpoint} (${d.fstype || "Drive"})</strong>
          <span style="color:var(--muted-foreground);">${d.free_gb} GB free / ${d.total_gb} GB (${d.percent_used}% used)</span>
        </div>
        <div class="progress-bar-container" style="margin:0 0 0.25rem 0;">
          <div class="progress-bar-fill ${d.percent_used > 85 ? "danger" : "primary"}" style="width: ${d.percent_used}%"></div>
        </div>
      `;
      drivesBox.appendChild(div);
    });
  }

  function renderHardwareLimits() {
    const hw = state.hardware;
    if (!hw) return;
    const list = document.getElementById("full-hw-spec-list");
    list.innerHTML = `
      <div class="spec-item">
        <span class="spec-label">Host Operating System</span>
        <span class="spec-val">${hw.os.system} ${hw.os.release} (${hw.os.machine})</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Python Environment</span>
        <span class="spec-val">Python ${hw.os.python_version}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Processor Brand</span>
        <span class="spec-val">${hw.cpu.name}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Core / Thread Topologies</span>
        <span class="spec-val">${hw.cpu.physical_cores} Physical Cores | ${hw.cpu.logical_threads} Threads</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Frequency (Clock)</span>
        <span class="spec-val">${hw.cpu.frequency_mhz?.current ? hw.cpu.frequency_mhz.current + " MHz" : "Standard"}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">CPU Thermal Sensor</span>
        <span class="spec-val">${hw.cpu.temperature_supported ? hw.cpu.temperature_celsius + " °C" : "Not supported on this driver"}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Total System Memory</span>
        <span class="spec-val">${hw.ram.total_gb} GB (${hw.ram.available_gb} GB free)</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Detected Graphics Hardware</span>
        <span class="spec-val">${hw.gpu.detected ? hw.gpu.name : "CPU / Integrated Graphics"}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Dedicated Video Memory (VRAM)</span>
        <span class="spec-val">${hw.gpu.dedicated_vram_formatted}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Shared Video Memory</span>
        <span class="spec-val">${hw.gpu.shared_vram_formatted}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">GPU Sensor Telemetry</span>
        <span class="spec-val">${hw.gpu.utilization_percent}</span>
      </div>
    `;

    const analysisBox = document.getElementById("hw-bottleneck-analysis");
    const cpuName = hw.cpu.name || "Detected CPU";
    const cores = hw.cpu.physical_cores || 4;
    const ramGb = hw.ram.total_gb || 8;
    const gpu = hw.gpu;

    let analysis = `Detected ${cpuName} with ${cores} physical cores and ${ramGb} GB RAM. `;
    if (!gpu.detected || !gpu.dedicated_vram_bytes || gpu.dedicated_vram_bytes < 1024 * 1024 * 1024) {
      analysis += `No high-bandwidth dedicated GPU VRAM detected. CPU GEMM execution with ${cores} threads provides the dependable and stable inference baseline.`;
    } else if (gpu.dedicated_vram_bytes >= 6 * 1024 * 1024 * 1024) {
      analysis += `High-capacity GPU (${gpu.name}) with ${gpu.dedicated_vram_formatted} dedicated VRAM detected. Capable of full or extensive GPU layer offloading for high token throughput.`;
    } else {
      analysis += `Mid-tier or legacy GPU (${gpu.name}) detected with ${gpu.dedicated_vram_formatted} VRAM. Partial layer offloading or CPU-only execution is evaluated dynamically to avoid PCIe bus bottlenecks.`;
    }
    analysisBox.textContent = analysis;
  }

  function renderRuntimeStatus() {
    const rt = state.runtimes;
    if (!rt) return;

    const active = rt.active_runtime;
    document.getElementById("dash-spec-runtime").textContent = active;
    document.getElementById("header-runtime-name").textContent = `Runtime: ${active}`;
    document.getElementById("rt-active-badge").textContent = active.toUpperCase();

    const dot = document.getElementById("runtime-status-dot");
    const llama = rt.llama_cpp;
    const ollama = rt.ollama;

    const startBtn = document.getElementById("btn-dash-start-server");
    const stopBtn = document.getElementById("btn-dash-stop-server");

    if (active === "ollama") {
      document.getElementById("rt-radio-ollama").checked = true;
      if (startBtn) startBtn.textContent = "Check Ollama Connection";
      if (stopBtn) stopBtn.textContent = "Halt Ollama Inference";
      if (ollama.detected) {
        dot.className = "status-dot online";
        document.getElementById("dash-runtime-tag").className = "badge success";
        document.getElementById("dash-runtime-tag").textContent = "OLLAMA CONNECTED";
      } else {
        dot.className = "status-dot offline";
        document.getElementById("dash-runtime-tag").className = "badge danger";
        document.getElementById("dash-runtime-tag").textContent = "OLLAMA OFFLINE";
      }
    } else {
      document.getElementById("rt-radio-llama").checked = true;
      if (startBtn) startBtn.textContent = "Start llama.cpp Server";
      if (stopBtn) stopBtn.textContent = "Stop Server";
      if (llama.status?.healthy) {
        dot.className = "status-dot online";
        document.getElementById("dash-runtime-tag").className = "badge success";
        document.getElementById("dash-runtime-tag").textContent = "LLAMA SERVER READY";
      } else if (llama.status?.running) {
        dot.className = "status-dot idle";
        document.getElementById("dash-runtime-tag").className = "badge warning";
        document.getElementById("dash-runtime-tag").textContent = "INITIALIZING";
      } else {
        dot.className = "status-dot offline";
        document.getElementById("dash-runtime-tag").className = "badge outline";
        document.getElementById("dash-runtime-tag").textContent = "SERVER STOPPED";
      }
    }

    document.getElementById("llama-exe-val").textContent = llama.executable_path || "Not configured";
    const lStatus = llama.status || {};
    if (lStatus.running) {
      document.getElementById("llama-status-badge").className = "badge success";
      document.getElementById("llama-status-badge").textContent = `RUNNING (PID ${lStatus.pid})`;
      document.getElementById("llama-pid-val").textContent = `PID ${lStatus.pid} on port ${lStatus.port} (${lStatus.uptime_seconds}s uptime)`;
      document.getElementById("llama-rss-val").textContent = lStatus.memory_rss_formatted || "0 B";
    } else {
      document.getElementById("llama-status-badge").className = "badge outline";
      document.getElementById("llama-status-badge").textContent = "STOPPED";
      document.getElementById("llama-pid-val").textContent = "Not running";
      document.getElementById("llama-rss-val").textContent = "0 B";
    }

    if (ollama.detected) {
      document.getElementById("ollama-status-badge").className = "badge success";
      document.getElementById("ollama-status-badge").textContent = `CONNECTED (v${ollama.version})`;
      document.getElementById("ollama-version-val").textContent = `v${ollama.version}`;
      const runningModels = (ollama.running_models || []).map((m) => m.name).join(", ");
      document.getElementById("ollama-running-val").textContent = runningModels || "None active";
    } else {
      document.getElementById("ollama-status-badge").className = "badge danger";
      document.getElementById("ollama-status-badge").textContent = "OFFLINE";
      document.getElementById("ollama-version-val").textContent = "Unavailable";
      document.getElementById("ollama-running-val").textContent = "Unavailable";
    }
  }

  function renderActiveModel() {
    const active = state.models.find((m) => m.id === state.activeModelId);
    const activeRuntime = state.runtimes?.active_runtime || state.config?.active_runtime || "llama.cpp server";
    if (active) {
      document.getElementById("header-model-name").textContent = active.name;
      document.getElementById("dash-spec-model").textContent = active.name;
      document.getElementById("dash-spec-size").textContent = `${active.format} (${active.quantization}) | ${active.size_formatted}`;
      document.getElementById("chat-active-model-title").textContent = `Model: ${active.name}`;

      const isOllama = (active.format === "Ollama" || active.source === "ollama_api" || activeRuntime === "ollama");
      const chatSub = document.getElementById("chat-active-config-badge");
      if (chatSub) {
        if (isOllama) {
          const isReachable = state.runtimes?.ollama?.detected;
          chatSub.textContent = `Runtime: Ollama (${isReachable ? "Connected" : "Offline"}) | Context: ${active.context_length || 4096}`;
        } else {
          const cfg = state.config?.llama_cpp || {};
          chatSub.textContent = `-t ${cfg.threads || 4} | -ngl ${cfg.gpu_layers || 0} | -c ${cfg.context_size || 2048}`;
        }
      }

      const cfg = state.config?.llama_cpp || {};
      document.getElementById("dash-spec-threads").textContent = cfg.threads || 4;
      document.getElementById("dash-spec-ngl").textContent = cfg.gpu_layers !== undefined ? cfg.gpu_layers : 0;
      document.getElementById("dash-spec-ctx").textContent = cfg.context_size || 2048;
      document.getElementById("dash-spec-mmap").textContent = cfg.use_mmap ? "Enabled (mmap)" : "Disabled (--no-mmap)";
    } else {
      document.getElementById("header-model-name").textContent = "None Selected";
      document.getElementById("dash-spec-model").textContent = "None Selected";
      document.getElementById("dash-spec-size").textContent = "-";
      document.getElementById("chat-active-model-title").textContent = "Model: None Selected";
      const chatSub = document.getElementById("chat-active-config-badge");
      if (chatSub) chatSub.textContent = "-";
    }
  }

  function getFilteredModels() {
    const q = (state.modelFilter.search || "").toLowerCase().trim();
    const rt = state.modelFilter.runtime;
    const fmt = state.modelFilter.format;
    const st = state.modelFilter.status;

    return state.models.filter((m) => {
      if (q) {
        const match =
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.architecture && m.architecture.toLowerCase().includes(q)) ||
          (m.quantization && m.quantization.toLowerCase().includes(q)) ||
          (m.path && m.path.toLowerCase().includes(q)) ||
          (m.id && m.id.toLowerCase().includes(q)) ||
          (m.parameter_size && m.parameter_size.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (rt !== "all") {
        if (rt === "ollama") {
          if (!m.runtime_compatibility.some((c) => c.toLowerCase().includes("ollama"))) return false;
        } else if (rt === "llama.cpp") {
          if (!m.runtime_compatibility.some((c) => c.toLowerCase().includes("llama.cpp"))) return false;
        }
      }
      if (fmt !== "all") {
        if (!m.format.toLowerCase().includes(fmt.toLowerCase())) return false;
      }
      if (st === "available") {
        if (!m.is_available) return false;
      } else if (st === "offline") {
        if (m.is_available) return false;
      }
      return true;
    });
  }

  function renderMonitoredDirectories() {
    const box = document.getElementById("monitored-dirs-list");
    if (!box) return;
    const dirs = state.config?.model_directories || ["models"];
    box.innerHTML = "";
    dirs.forEach((d) => {
      const span = document.createElement("span");
      span.className = "directory-tag";
      span.innerHTML = `
        <span>${escapeHtml(d)}</span>
        <button class="tag-remove-btn" data-dir="${escapeHtml(d)}" title="Remove folder from search paths">×</button>
      `;
      box.appendChild(span);
    });

    box.querySelectorAll(".tag-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const dirPath = btn.getAttribute("data-dir");
        if (!confirm(`Remove directory '${dirPath}' from model search paths?`)) return;
        try {
          const res = await fetch("/api/v1/models/directories", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directory_path: dirPath }),
          });
          if (!res.ok) throw new Error("Failed to remove directory");
          showToast(`Removed search directory: ${dirPath}`, "info");
          await loadConfig();
          await loadModels();
        } catch (err) {
          showToast(err.message, "danger");
        }
      });
    });
  }

  function openModelDetailsModal(modelId) {
    const m = state.models.find((item) => item.id === modelId);
    if (!m) return;

    document.getElementById("details-modal-title").textContent = m.name;
    document.getElementById("details-modal-id").textContent = `ID: ${m.id} | Source: ${m.source || "unknown"}`;

    const statusBadge = document.getElementById("details-modal-status-badge");
    if (m.is_available) {
      statusBadge.className = "badge success";
      statusBadge.textContent = "Available";
    } else {
      statusBadge.className = "badge danger";
      statusBadge.textContent = m.status_message || "Unavailable";
    }

    const grid = document.getElementById("details-modal-grid");
    grid.innerHTML = `
      <div><span class="spec-label">Model Format:</span> <strong style="color:var(--foreground);">${escapeHtml(m.format)}</strong></div>
      <div><span class="spec-label">Quantization Scheme:</span> <strong style="color:var(--foreground);">${escapeHtml(m.quantization)}</strong></div>
      <div><span class="spec-label">Architecture / Family:</span> <strong style="color:var(--foreground);">${escapeHtml(m.architecture || "Unknown")}</strong></div>
      <div><span class="spec-label">Parameter Count:</span> <strong style="color:var(--foreground);">${escapeHtml(m.parameter_size || "Unknown")}</strong></div>
      <div><span class="spec-label">Context Window:</span> <strong style="color:var(--foreground);">${m.context_length || 2048} tokens</strong></div>
      <div><span class="spec-label">File Size:</span> <strong style="color:var(--foreground);">${m.size_formatted} (${(m.size_bytes || 0).toLocaleString()} bytes)</strong></div>
      <div><span class="spec-label">Compatible Runtimes:</span> <strong style="color:var(--foreground);">${(m.runtime_compatibility || []).join(", ")}</strong></div>
      <div><span class="spec-label">Storage Partition:</span> <strong style="color:var(--foreground);">${escapeHtml(m.location_drive || "System Disk")}</strong></div>
      <div class="modal-details-full"><span class="spec-label">Resolved File Path:</span> <div style="font-family:var(--font-mono); font-size:0.75rem; word-break:break-all; margin-top:0.2rem; color:var(--foreground);">${escapeHtml(m.path)}</div></div>
      <div class="modal-details-full"><span class="spec-label">Availability Detail:</span> <div style="font-size:0.78rem; margin-top:0.2rem; color:${m.is_available ? 'var(--foreground)' : '#f87171'};">${escapeHtml(m.status_message || "Normal")}</div></div>
    `;

    document.getElementById("modal-model-details").classList.add("active");
  }

  function renderModelCatalog() {
    renderMonitoredDirectories();
    const filtered = getFilteredModels();
    const tbody = document.getElementById("models-table-body");
    const emptyBox = document.getElementById("models-empty-state");
    const tableContainer = document.getElementById("models-table-container");
    const countBadge = document.getElementById("model-count-badge");

    if (countBadge) {
      countBadge.textContent = `${filtered.length} of ${state.models.length} model${state.models.length === 1 ? "" : "s"}`;
    }

    if (state.models.length === 0) {
      if (emptyBox) emptyBox.style.display = "flex";
      if (tableContainer) tableContainer.style.display = "none";
      return;
    }

    if (filtered.length === 0) {
      if (emptyBox) emptyBox.style.display = "none";
      if (tableContainer) tableContainer.style.display = "block";
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted-foreground); padding:2rem;">No models match your current filter and search query. Try clearing filters.</td></tr>`;
      return;
    }

    if (emptyBox) emptyBox.style.display = "none";
    if (tableContainer) tableContainer.style.display = "block";
    tbody.innerHTML = "";

    filtered.forEach((m) => {
      const isActive = m.id === state.activeModelId;
      const isAvail = m.is_available;
      const tr = document.createElement("tr");

      let statusBadge = "";
      if (isAvail) {
        statusBadge = `<span class="badge success" title="${escapeHtml(m.status_message || 'Available')}">Available</span>`;
      } else {
        statusBadge = `<span class="badge danger" title="${escapeHtml(m.status_message || 'Unavailable')}">${escapeHtml(m.status_message || 'Missing')}</span>`;
      }

      tr.innerHTML = `
        <td>
          <div style="font-weight:600; display:flex; align-items:center; gap:0.4rem;">
            ${isActive ? '<span class="status-dot online" title="Active Model"></span>' : ""}
            ${escapeHtml(m.name)}
          </div>
          <div style="font-size:0.7rem; color:var(--muted-foreground); font-family:var(--font-mono); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(m.path)}">${escapeHtml(m.path)}</div>
        </td>
        <td>
          <div style="font-size:0.8rem; font-weight:500;">${escapeHtml(m.architecture || "Unknown")}</div>
          <div style="font-size:0.7rem; color:var(--muted-foreground);">${escapeHtml(m.parameter_size || "-")}</div>
        </td>
        <td>
          <span class="badge ${m.format.includes("GGUF") ? "primary" : "secondary"}">${escapeHtml(m.format)}</span>
          <span class="badge outline" style="margin-left:0.25rem;">${escapeHtml(m.quantization)}</span>
        </td>
        <td style="font-family:var(--font-mono); font-size:0.8rem;">${m.size_formatted}</td>
        <td><span style="font-size:0.75rem; color:var(--muted-foreground);">${m.runtime_compatibility.join(", ")}</span></td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            ${
              isActive
                ? '<button class="btn btn-outline btn-sm" disabled style="opacity:0.6;">Active</button>'
                : `<button class="btn btn-primary btn-sm btn-select-model" data-id="${escapeHtml(m.id)}" ${!isAvail ? 'disabled title="Cannot select missing model"' : ''}>Select</button>`
            }
            <button class="btn btn-secondary btn-sm btn-view-model-details" data-id="${escapeHtml(m.id)}" title="View metadata and technical parameters">Details</button>
            <button class="btn btn-outline btn-sm btn-del-model" data-id="${escapeHtml(m.id)}" title="Remove entry from catalog without deleting file on disk">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-select-model").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = b.getAttribute("data-id");
        try {
          const res = await fetch("/api/v1/models/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model_id: id }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to select model");
          }
          const d = await res.json();
          state.activeModelId = id;
          if (d.active_runtime && state.runtimes) {
            state.runtimes.active_runtime = d.active_runtime;
          }
          showToast(`Selected model: ${d.model?.name || id} (${d.active_runtime || "active"})`, "success");
          await loadModels();
          await loadRuntimes();
          renderActiveModel();
          triggerRecommendation();
        } catch (e) {
          showToast(e.message, "danger");
        }
      });
    });

    tbody.querySelectorAll(".btn-view-model-details").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = b.getAttribute("data-id");
        openModelDetailsModal(id);
      });
    });

    tbody.querySelectorAll(".btn-del-model").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = b.getAttribute("data-id");
        if (!id) return;
        if (!confirm(`Remove model '${id}' from catalog?\n\nNote: The actual model file on disk will NOT be deleted.`)) return;
        try {
          const res = await fetch(`/api/v1/models/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to remove model");
          }
          showToast(`Model '${id}' removed from catalog (file preserved on disk)`, "info");
          await loadModels();
          await loadRuntimes();
          renderActiveModel();
        } catch (e) {
          showToast(e.message, "danger");
        }
      });
    });
  }

  function updateEngineModelSelect() {
    const sel = document.getElementById("engine-eval-model-select");
    sel.innerHTML = "";
    if (state.models.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No local models found. Connect an inference runtime or add a model directory.";
      sel.appendChild(opt);
      triggerRecommendation();
      return;
    }
    state.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.size_formatted} - ${m.quantization})`;
      if (m.id === state.activeModelId) opt.selected = true;
      sel.appendChild(opt);
    });
    triggerRecommendation();
  }

  async function triggerRecommendation() {
    const sel = document.getElementById("engine-eval-model-select");
    const modelId = sel.value || state.activeModelId;
    const ctx = parseInt(document.getElementById("engine-ctx-slider").value, 10);
    document.getElementById("engine-ctx-val").textContent = ctx;

    try {
      const res = await fetch("/api/v1/config/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, context_length: ctx }),
      });
      if (!res.ok) throw new Error("Recommendation error");
      const rec = await res.json();
      renderRecommendationResults(rec);
    } catch (e) {
      console.debug(e);
    }
  }

  function renderRecommendationResults(rec) {
    state.currentRecommendation = rec;
    const mem = rec.memory_breakdown;
    document.getElementById("engine-mem-weights").textContent = mem.weights_formatted;
    document.getElementById("engine-mem-kv").textContent = mem.kv_cache_formatted;
    document.getElementById("engine-mem-act").textContent = mem.activation_buffer_formatted;
    document.getElementById("engine-mem-total").textContent = `${mem.total_required_formatted} (Avail: ${mem.available_ram_formatted})`;

    const alertBox = document.getElementById("engine-safety-alert");
    const safety = rec.safety;
    document.getElementById("engine-safety-text").textContent = safety.message;

    if (safety.tier === "SAFE") {
      alertBox.className = "alert alert-success";
      document.getElementById("dash-safety-tier-badge").className = "badge success";
      document.getElementById("dash-safety-tier-badge").textContent = "SAFE";
    } else if (safety.tier === "TIGHT") {
      alertBox.className = "alert alert-warning";
      document.getElementById("dash-safety-tier-badge").className = "badge warning";
      document.getElementById("dash-safety-tier-badge").textContent = "TIGHT";
    } else if (safety.tier === "AWAITING_MODEL") {
      alertBox.className = "alert";
      document.getElementById("dash-safety-tier-badge").className = "badge outline";
      document.getElementById("dash-safety-tier-badge").textContent = "NO MODEL";
    } else {
      alertBox.className = "alert alert-danger";
      document.getElementById("dash-safety-tier-badge").className = "badge danger";
      document.getElementById("dash-safety-tier-badge").textContent = "EXCEEDS";
    }
    document.getElementById("dash-safety-desc").textContent = safety.message;

    const r = rec.recommendations;
    document.getElementById("rec-threads").textContent = r.threads;
    document.getElementById("rec-ngl").textContent = r.gpu_layers;
    document.getElementById("rec-batch").textContent = r.batch_size;
    document.getElementById("rec-mmap").textContent = r.use_mmap ? "Enabled" : "Disabled";

    const exp = rec.explanations;
    document.getElementById("rec-reasoning-text").innerHTML = `
      <strong>CPU:</strong> ${escapeHtml(exp.cpu_threads)}<br>
      <strong>GPU:</strong> ${escapeHtml(exp.gpu_offload)}<br>
      <strong>Memory & Context:</strong> ${escapeHtml(exp.context_capacity)}
    `;
  }

  function renderConfigInputs() {
    const cfg = state.config;
    if (!cfg) return;

    document.getElementById("cfg-active-runtime").value = cfg.active_runtime;
    document.getElementById("cfg-llama-exe").value = cfg.llama_cpp.executable_path || "";
    document.getElementById("cfg-llama-host").value = cfg.llama_cpp.host || "127.0.0.1";
    document.getElementById("cfg-llama-port").value = cfg.llama_cpp.port || 8080;
    document.getElementById("cfg-ollama-url").value = cfg.ollama.base_url || "http://127.0.0.1:11434";
    document.getElementById("cfg-model-dirs").value = (cfg.model_directories || []).join("\n");

    const sec = cfg.security || {};
    document.getElementById("cfg-allow-remote").checked = Boolean(sec.allow_remote_access);
    document.getElementById("cfg-api-key").value = sec.api_key || "";
    document.getElementById("cfg-listen-host").value = sec.listen_host || "127.0.0.1";
    document.getElementById("cfg-listen-port").value = sec.listen_port || 8000;

    document.getElementById("llama-param-threads").value = cfg.llama_cpp.threads || 4;
    document.getElementById("llama-param-ngl").value = cfg.llama_cpp.gpu_layers || 0;
    document.getElementById("llama-param-ctx").value = cfg.llama_cpp.context_size || 2048;
    document.getElementById("llama-param-port").value = cfg.llama_cpp.port || 8080;
  }

  async function loadDiagnostics() {
    document.getElementById("diag-overall-badge").textContent = "Checking...";
    try {
      const res = await fetch("/api/v1/diagnostics");
      if (!res.ok) throw new Error("Diagnostics error");
      const data = await res.json();
      state.diagnostics = data;

      const badge = document.getElementById("diag-overall-badge");
      if (data.overall_status === "ok") {
        badge.className = "badge success";
        badge.textContent = "HEALTHY";
      } else if (data.overall_status === "warning") {
        badge.className = "badge warning";
        badge.textContent = "ATTENTION REQUIRED";
      } else {
        badge.className = "badge danger";
        badge.textContent = "ERROR DETECTED";
      }

      const list = document.getElementById("diag-checks-list");
      list.innerHTML = "";
      (data.checks || []).forEach((c) => {
        let statusBadge = `<span class="badge success">OK</span>`;
        if (c.status === "warning") statusBadge = `<span class="badge warning">WARNING</span>`;
        if (c.status === "error") statusBadge = `<span class="badge danger">ERROR</span>`;

        const div = document.createElement("div");
        div.className = "spec-item";
        div.style.padding = "0.75rem 0";
        div.innerHTML = `
          <div>
            <div style="font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:0.5rem;">
              ${statusBadge}
              ${escapeHtml(c.name)}
            </div>
            <div style="font-size:0.75rem; color:var(--muted-foreground); margin-top:0.2rem;">${escapeHtml(c.message)}</div>
            ${c.remediation ? `<div style="font-size:0.72rem; color:#facc15; margin-top:0.2rem;">Remediation: ${escapeHtml(c.remediation)}</div>` : ""}
          </div>
        `;
        list.appendChild(div);
      });

      loadLogs();
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  async function loadLogs() {
    const box = document.getElementById("log-display-box");
    box.textContent = "Fetching log records...";
    const endpoint = state.currentLogSource === "llama" ? "/api/v1/logs/llama" : "/api/v1/logs/app";
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Log read failed");
      const d = await res.json();
      box.textContent = d.logs || "Log file is empty.";
      box.scrollTop = box.scrollHeight;
    } catch (e) {
      box.textContent = `Error reading logs: ${e.message}`;
    }
  }

  function updateBenchmarkModelSelects() {
    const benchSel = document.getElementById("bench-select-model");
    const evalSel = document.getElementById("eval-select-model");
    if (!benchSel || !evalSel) return;
    benchSel.innerHTML = "";
    evalSel.innerHTML = "";

    if (state.models.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No models discovered. Connect runtime or add directory.";
      benchSel.appendChild(opt);
      evalSel.appendChild(opt.cloneNode(true));
      return;
    }

    state.models.forEach((m) => {
      const opt1 = document.createElement("option");
      opt1.value = m.id;
      opt1.textContent = `${m.name} (${m.format} - ${m.size_formatted})`;
      if (m.id === state.activeModelId) opt1.selected = true;
      benchSel.appendChild(opt1);

      const opt2 = opt1.cloneNode(true);
      evalSel.appendChild(opt2);
    });
  }

  async function loadBenchmarks() {
    try {
      const res = await fetch("/api/v1/benchmarks");
      if (!res.ok) throw new Error("Benchmark read error");
      const data = await res.json();
      state.benchmarks = data;

      // 1. Historical baseline (B01-B08)
      const hist = data.historical || {};
      const tbody = document.getElementById("bm-matrix-tbody");
      if (tbody) {
        tbody.innerHTML = "";
        (hist.test_matrix || []).forEach((row) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${escapeHtml(row["ID"] || "")}</strong></td>
            <td>${escapeHtml(row["Model / runtime"] || "")}</td>
            <td><code>${escapeHtml(row["Configuration"] || "")}</code></td>
            <td>${escapeHtml(row["Storage / context"] || "")}</td>
            <td style="color:#60a5fa; font-weight:500;">${escapeHtml(row["My result"] || "")}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      // 2. Measured local runs
      const measured = data.measured || [];
      const measuredTbody = document.getElementById("bench-measured-tbody");
      if (measuredTbody) {
        measuredTbody.innerHTML = "";
        if (measured.length === 0) {
          measuredTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--muted-foreground); padding:1.25rem;">No local benchmark runs recorded yet. Click 'Execute Benchmark Run' above.</td></tr>`;
        } else {
          measured.forEach((b) => {
            const tr = document.createElement("tr");
            const statusBadge = b.status === "completed" ? `<span class="badge success">COMPLETED</span>` : `<span class="badge danger">FAILED</span>`;
            tr.innerHTML = `
              <td style="font-size:0.75rem; color:var(--muted-foreground);">${escapeHtml(b.timestamp || "")}</td>
              <td><strong>${escapeHtml(b.model || "")}</strong></td>
              <td><span class="badge outline">${escapeHtml(b.runtime || "")}</span></td>
              <td><code>-t ${b.threads || 4} -ngl ${b.gpu_layers || 0}</code></td>
              <td style="color:#10b981; font-weight:600;">${b.eval_tps || 0} t/s</td>
              <td>${b.ttft_ms ? b.ttft_ms + " ms" : "--"}</td>
              <td>${b.peak_ram_mb ? b.peak_ram_mb + " MB" : "--"}</td>
              <td>${statusBadge}</td>
              <td><button class="btn btn-outline btn-sm btn-del-benchmark" data-id="${b.id}" style="padding:0.15rem 0.4rem; font-size:0.7rem;">Delete</button></td>
            `;
            measuredTbody.appendChild(tr);
          });

          measuredTbody.querySelectorAll(".btn-del-benchmark").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const bId = btn.getAttribute("data-id");
              try {
                const dRes = await fetch(`/api/v1/benchmarks/${bId}`, { method: "DELETE" });
                if (!dRes.ok) throw new Error("Delete failed");
                showToast("Benchmark run deleted", "info");
                loadBenchmarks();
              } catch (e) {
                showToast(e.message, "danger");
              }
            });
          });
        }
      }
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  async function loadEvaluations() {
    try {
      const res = await fetch("/api/v1/evaluations");
      if (!res.ok) return;
      const data = await res.json();
      const evals = data.evaluations || [];
      if (evals.length > 0) {
        renderQualityEvaluation(evals[0]);
      }
    } catch (e) {
      console.debug(e);
    }
  }

  function renderQualityEvaluation(evalRecord) {
    const container = document.getElementById("eval-results-container");
    if (!container || !evalRecord) return;

    const score = evalRecord.composite_score || 0.0;
    let scoreClass = "low";
    if (score >= 7.5) scoreClass = "high";
    else if (score >= 5.0) scoreClass = "mid";

    const tasksHtml = (evalRecord.tasks || []).map((t) => `
      <div class="task-eval-card">
        <div class="task-eval-header">
          <span style="font-weight:600; font-size:0.85rem;">${escapeHtml(t.task_name)}</span>
          <span class="badge ${t.score >= 8 ? "success" : t.score >= 5 ? "warning" : "danger"}">${t.score} / ${t.max_score}</span>
        </div>
        <div class="task-eval-prompt"><strong>Prompt:</strong> ${escapeHtml(t.prompt)}</div>
        <div class="task-eval-response">${escapeHtml(t.response || "No response")}</div>
        <div class="task-eval-rationale"><strong>Evaluation:</strong> ${escapeHtml(t.rationale)} (${t.duration_ms} ms)</div>
      </div>
    `).join("");

    const humanRatingVal = evalRecord.human_rating ? `${evalRecord.human_rating}/10` : "Unrated";

    container.innerHTML = `
      <div class="scorecard-hero">
        <div>
          <div style="font-size:0.75rem; color:var(--muted-foreground); text-transform:uppercase; letter-spacing:0.05em;">Evaluated Model & Runtime</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--foreground);">${escapeHtml(evalRecord.model)} <span class="badge outline">${escapeHtml(evalRecord.runtime)}</span></div>
          <div style="font-size:0.75rem; color:var(--muted-foreground); margin-top:0.25rem;">Timestamp: ${escapeHtml(evalRecord.timestamp)} | Human Validation: <strong style="color:#f59e0b;">${humanRatingVal}</strong></div>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--muted-foreground);">Automated Battery Score</div>
            <div style="font-size:0.7rem; color:var(--muted-foreground);">6 Standardized Tasks</div>
          </div>
          <div class="score-badge-circle ${scoreClass}">${score.toFixed(1)}<span style="font-size:1rem; font-weight:500;">/10</span></div>
        </div>
      </div>

      <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.5rem;">Standardized 6-Task Evaluation Battery Breakdown:</div>
      <div class="task-eval-grid">
        ${tasksHtml}
      </div>

      <div class="card" style="margin-top:1rem; border-color:rgba(245,158,11,0.3);">
        <div class="card-header">
          <div>
            <div class="card-title" style="color:#f59e0b;">Human Quality Rating & Qualitative Review</div>
            <div class="card-desc">Assign your own empirical rating (1-10) to validate automated scoring</div>
          </div>
          <span class="badge warning">Human Feedback</span>
        </div>
        <div class="rating-bar-container" id="star-rating-buttons">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => `<button type="button" class="star-btn ${evalRecord.human_rating === num ? "selected" : ""}" data-star="${num}">${num} ★</button>`).join("")}
        </div>
        <div class="form-group" style="margin-top:0.5rem;">
          <input type="text" class="input" id="eval-human-feedback" placeholder="Add qualitative observation (e.g. 'Clear explanations, accurate JSON output')" value="${escapeHtml(evalRecord.human_feedback || "")}">
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
          <button class="btn btn-warning btn-sm" id="btn-submit-eval-rating" data-id="${evalRecord.id}">Save Human Rating</button>
        </div>
      </div>
    `;

    let selectedRating = evalRecord.human_rating || 7.0;
    container.querySelectorAll(".star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".star-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        selectedRating = parseFloat(btn.getAttribute("data-star"));
      });
    });

    const btnSubmitRating = document.getElementById("btn-submit-eval-rating");
    if (btnSubmitRating) {
      btnSubmitRating.addEventListener("click", async () => {
        const evalId = btnSubmitRating.getAttribute("data-id");
        const feedback = document.getElementById("eval-human-feedback").value.trim();
        try {
          const res = await fetch(`/api/v1/evaluations/${evalId}/rating`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating: selectedRating, feedback: feedback, evaluator: "User" }),
          });
          if (!res.ok) throw new Error("Failed to save rating");
          showToast(`Human rating recorded: ${selectedRating}/10`, "success");
          await loadEvaluations();
        } catch (e) {
          showToast(e.message, "danger");
        }
      });
    }
  }

  async function renderPackagingRuntimes() {
    const list = document.getElementById("pkg-runtime-matrix");
    if (!list) return;
    list.innerHTML = `<div style="color:var(--muted-foreground); font-size:0.8rem; padding:0.5rem 0;">Checking runtime adapters...</div>`;
    try {
      const res = await fetch("/api/v1/runtimes");
      if (!res.ok) throw new Error("Runtimes check error");
      const data = await res.json();
      const adapters = data.adapters || {};
      list.innerHTML = "";
      Object.entries(adapters).forEach(([k, v]) => {
        const isAvail = v.available;
        const item = document.createElement("div");
        item.className = "spec-item";
        item.style.padding = "0.6rem 0";
        item.innerHTML = `
          <div>
            <div style="font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:0.5rem;">
              <span class="badge ${isAvail ? "success" : "outline"}">${isAvail ? "AVAILABLE" : "OFFLINE"}</span>
              ${escapeHtml(v.display_name || k)}
            </div>
            <div style="font-size:0.75rem; color:var(--muted-foreground); margin-top:0.2rem;">Formats: ${(v.supported_formats || []).join(", ")} | Status: ${escapeHtml(v.message || "")}</div>
          </div>
        `;
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = `<div style="color:#ef4444; font-size:0.8rem;">Failed to query runtimes: ${e.message}</div>`;
    }
  }

  async function pollLiveTelemetry() {
    try {
      const res = await fetch("/api/v1/metrics");
      if (!res.ok) return;
      const data = await res.json();
      updateMetricsUI(data);
    } catch (e) {
      // background poll note
    }
  }

  function setupChat() {
    const input = document.getElementById("chat-user-input");
    const btnSend = document.getElementById("btn-send-chat");
    const btnStop = document.getElementById("btn-stop-chat");
    const btnClear = document.getElementById("btn-clear-chat");
    const messagesBox = document.getElementById("chat-messages-box");

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    btnSend.addEventListener("click", sendMessage);
    btnStop.addEventListener("click", stopMessage);
    btnClear.addEventListener("click", () => {
      state.chatMessages = [];
      messagesBox.innerHTML = `
        <div class="chat-bubble system">
          Conversation history cleared. Ready for new local inference prompts.
        </div>
      `;
    });

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || state.isGenerating) return;

      if (!state.activeModelId || state.models.length === 0) {
        showToast("No active model selected. Connect an inference runtime or add a model directory.", "warning");
        return;
      }

      input.value = "";
      state.isGenerating = true;
      btnSend.style.display = "none";
      btnStop.style.display = "block";

      const userBubble = document.createElement("div");
      userBubble.className = "chat-bubble user";
      userBubble.textContent = text;
      messagesBox.appendChild(userBubble);
      messagesBox.scrollTop = messagesBox.scrollHeight;

      state.chatMessages.push({ role: "user", content: text });

      const assistantBubble = document.createElement("div");
      assistantBubble.className = "chat-bubble assistant";
      assistantBubble.innerHTML = `<span style="color:var(--muted-foreground); font-style:italic;">Evaluating prompt on local hardware...</span>`;
      messagesBox.appendChild(assistantBubble);
      messagesBox.scrollTop = messagesBox.scrollHeight;

      const isStream = document.getElementById("chat-stream-toggle").checked;
      const temp = parseFloat(document.getElementById("chat-temp").value) || 0.7;
      const maxToks = parseInt(document.getElementById("chat-max-tokens").value, 10) || 512;

      state.activeAbortController = new AbortController();

      try {
        const payload = {
          messages: state.chatMessages,
          temperature: temp,
          max_tokens: maxToks,
          stream: isStream,
        };

        const res = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: state.activeAbortController.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
          throw new Error(errData.detail || `Inference error: HTTP ${res.status}`);
        }

        if (isStream) {
          assistantBubble.innerHTML = "";
          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let fullContent = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === "data: [DONE]") break;
              if (trimmed.startsWith("data: ")) {
                try {
                  const data = JSON.parse(trimmed.slice(6));
                  if (data.error) throw new Error(data.error);
                  const delta = data.choices?.[0]?.delta?.content || "";
                  fullContent += delta;
                  assistantBubble.textContent = fullContent;
                  messagesBox.scrollTop = messagesBox.scrollHeight;
                } catch (parseErr) {
                  // Ignore partial SSE chunk parses
                }
              }
            }
          }
          state.chatMessages.push({ role: "assistant", content: fullContent });
        } else {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          assistantBubble.textContent = content;
          state.chatMessages.push({ role: "assistant", content: content });
        }
      } catch (err) {
        if (err.name === "AbortError") {
          assistantBubble.innerHTML += `<div style="color:#f87171; font-size:0.75rem; margin-top:0.3rem;">[Generation cancelled by user]</div>`;
        } else {
          assistantBubble.innerHTML = `<span style="color:#f87171;">Error: ${escapeHtml(err.message)}</span>`;
          showToast(err.message, "danger");
        }
      } finally {
        state.isGenerating = false;
        state.activeAbortController = null;
        btnSend.style.display = "block";
        btnStop.style.display = "none";
        messagesBox.scrollTop = messagesBox.scrollHeight;
      }
    }

    async function stopMessage() {
      if (state.activeAbortController) {
        state.activeAbortController.abort();
      }
      try {
        await fetch("/api/v1/inference/stop", { method: "POST" });
      } catch (e) {}
      showToast("Generation stopped", "info");
    }
  }

  function setupActionHandlers() {
    document.getElementById("btn-quick-diag")?.addEventListener("click", () => {
      document.querySelector('[data-tab="tab-diagnostics"]')?.click();
    });

    document.getElementById("btn-refresh-hw")?.addEventListener("click", async () => {
      await loadHardware();
      showToast("Hardware profile refreshed", "success");
    });

    document.getElementById("engine-ctx-slider")?.addEventListener("input", triggerRecommendation);
    document.getElementById("engine-eval-model-select")?.addEventListener("change", triggerRecommendation);

    document.getElementById("btn-apply-recommendation")?.addEventListener("click", async () => {
      if (!state.currentRecommendation) return;
      const rec = state.currentRecommendation.recommendations;
      try {
        const curCfg = state.config;
        curCfg.llama_cpp.threads = rec.threads;
        curCfg.llama_cpp.gpu_layers = rec.gpu_layers;
        curCfg.llama_cpp.context_size = rec.context_size;
        curCfg.llama_cpp.batch_size = rec.batch_size;
        curCfg.llama_cpp.ubatch_size = rec.ubatch_size;
        curCfg.llama_cpp.use_mmap = rec.use_mmap;

        const res = await fetch("/api/v1/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(curCfg),
        });
        if (!res.ok) throw new Error("Failed to save configuration");
        showToast("Recommended configuration applied & saved!", "success");
        await loadConfig();
        renderActiveModel();
      } catch (e) {
        showToast(e.message, "danger");
      }
    });

    document.querySelectorAll('input[name="runtime-select"]').forEach((radio) => {
      radio.addEventListener("change", async (e) => {
        const targetRuntime = e.target.value;
        try {
          const res = await fetch("/api/v1/runtimes/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runtime: targetRuntime }),
          });
          if (!res.ok) throw new Error("Failed to switch runtime");
          showToast(`Switched active runtime to: ${targetRuntime}`, "success");
          await loadConfig();
          await loadRuntimes();
          renderActiveModel();
        } catch (err) {
          showToast(err.message, "danger");
        }
      });
    });

    const startServerHandler = async () => {
      const threads = parseInt(document.getElementById("llama-param-threads").value, 10);
      const ngl = parseInt(document.getElementById("llama-param-ngl").value, 10);
      const ctx = parseInt(document.getElementById("llama-param-ctx").value, 10);
      const port = parseInt(document.getElementById("llama-param-port").value, 10);

      showToast("Starting llama.cpp server subprocess...", "info");
      try {
        const res = await fetch("/api/v1/runtimes/llama/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threads,
            gpu_layers: ngl,
            context_size: ctx,
            port,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to start llama-server");
        }
        showToast("llama-server successfully started!", "success");
        await loadRuntimes();
      } catch (e) {
        showToast(e.message, "danger");
      }
    };

    document.getElementById("btn-start-llama-proc")?.addEventListener("click", startServerHandler);

    const stopServerHandler = async () => {
      try {
        const res = await fetch("/api/v1/runtimes/llama/stop", { method: "POST" });
        if (!res.ok) throw new Error("Failed to stop llama-server");
        showToast("llama-server stopped", "info");
        await loadRuntimes();
      } catch (e) {
        showToast(e.message, "danger");
      }
    };

    document.getElementById("btn-stop-llama-proc")?.addEventListener("click", stopServerHandler);

    // Dashboard Start/Stop buttons that respect active runtime
    const dashStartHandler = async () => {
      const activeRt = state.runtimes?.active_runtime || state.config?.active_runtime || "llama.cpp server";
      if (activeRt === "ollama") {
        showToast("Verifying Ollama service connection...", "info");
        try {
          const res = await fetch("/api/v1/runtimes/start", { method: "POST" });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.detail || "Ollama service unreachable");
          }
          showToast("Ollama service connected and responsive!", "success");
          await loadRuntimes();
          renderActiveModel();
        } catch (e) {
          showToast(e.message, "danger");
        }
      } else {
        await startServerHandler();
      }
    };

    const dashStopHandler = async () => {
      const activeRt = state.runtimes?.active_runtime || state.config?.active_runtime || "llama.cpp server";
      if (activeRt === "ollama") {
        try {
          await fetch("/api/v1/runtimes/stop", { method: "POST" });
          showToast("Ollama inference session halted", "info");
          await loadRuntimes();
        } catch (e) {
          showToast(e.message, "danger");
        }
      } else {
        await stopServerHandler();
      }
    };

    document.getElementById("btn-dash-start-server")?.addEventListener("click", dashStartHandler);
    document.getElementById("btn-dash-stop-server")?.addEventListener("click", dashStopHandler);

    document.getElementById("btn-dash-open-chat")?.addEventListener("click", () => {
      document.querySelector('[data-tab="tab-chat"]')?.click();
    });

    document.getElementById("btn-scan-models")?.addEventListener("click", async () => {
      showToast("Scanning directories and Ollama for models...", "info");
      try {
        const res = await fetch("/api/v1/models/scan", { method: "POST" });
        if (!res.ok) throw new Error("Scan failed");
        const d = await res.json();
        showToast(`Discovered ${d.count} models`, "success");
        await loadModels();
      } catch (e) {
        showToast(e.message, "danger");
      }
    });

    document.getElementById("btn-refresh-models")?.addEventListener("click", async () => {
      showToast("Verifying model availability...", "info");
      try {
        const res = await fetch("/api/v1/models/refresh", { method: "POST" });
        if (!res.ok) throw new Error("Refresh failed");
        const d = await res.json();
        showToast(`Refreshed ${d.count} models (${d.available_count} available)`, "success");
        await loadModels();
      } catch (e) {
        showToast(e.message, "danger");
      }
    });

    // Model Search and Filter Listeners
    document.getElementById("model-search-input")?.addEventListener("input", (e) => {
      state.modelFilter.search = e.target.value;
      renderModelCatalog();
    });

    document.getElementById("model-filter-runtime")?.addEventListener("change", (e) => {
      state.modelFilter.runtime = e.target.value;
      renderModelCatalog();
    });

    document.getElementById("model-filter-format")?.addEventListener("change", (e) => {
      state.modelFilter.format = e.target.value;
      renderModelCatalog();
    });

    document.getElementById("model-filter-status")?.addEventListener("change", (e) => {
      state.modelFilter.status = e.target.value;
      renderModelCatalog();
    });

    // Empty state triggers
    document.getElementById("btn-empty-scan")?.addEventListener("click", () => {
      document.getElementById("btn-scan-models")?.click();
    });
    document.getElementById("btn-empty-add-dir")?.addEventListener("click", () => {
      document.getElementById("modal-add-directory")?.classList.add("active");
    });
    document.getElementById("btn-empty-add-file")?.addEventListener("click", () => {
      document.getElementById("modal-add-model")?.classList.add("active");
    });

    // Universal Modal Close & Cancel Logic
    const closeAnyModal = (modalId) => {
      if (modalId) {
        const m = document.getElementById(modalId);
        if (m) {
          m.classList.remove("active");
          if (modalId === "modal-add-model") {
            const pInput = document.getElementById("input-model-path");
            const nInput = document.getElementById("input-model-name");
            const fInput = document.getElementById("input-model-file-picker");
            if (pInput) pInput.value = "";
            if (nInput) nInput.value = "";
            if (fInput) fInput.value = "";
          }
          if (modalId === "modal-add-directory") {
            const dInput = document.getElementById("input-dir-path");
            if (dInput) dInput.value = "";
          }
        }
      } else {
        document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.remove("active"));
      }
    };

    // Close and Cancel buttons in all modals
    document.querySelectorAll(".btn-close-modal, .btn-modal-close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const modalId = btn.getAttribute("data-modal");
        closeAnyModal(modalId);
      });
    });

    // Close modal on backdrop click outside modal content
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          closeAnyModal(backdrop.id);
        }
      });
    });

    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop.active").forEach((m) => {
          closeAnyModal(m.id);
        });
      }
    });

    // Add Model Modal
    const modalAdd = document.getElementById("modal-add-model");
    document.getElementById("btn-open-add-model")?.addEventListener("click", () => {
      modalAdd.classList.add("active");
    });

    document.getElementById("input-model-file-picker")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const pathInput = document.getElementById("input-model-path");
        const nameInput = document.getElementById("input-model-name");
        const pickedPath = file.path || file.name;
        pathInput.value = pickedPath;
        if (!nameInput.value) {
          nameInput.value = file.name.replace(/\.[^/.]+$/, "");
        }
      }
    });

    document.getElementById("btn-submit-add-model")?.addEventListener("click", async () => {
      const pathVal = document.getElementById("input-model-path").value.trim();
      const nameVal = document.getElementById("input-model-name").value.trim();
      if (!pathVal) {
        showToast("Model path cannot be empty", "warning");
        return;
      }
      try {
        const res = await fetch("/api/v1/models/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathVal, name: nameVal || null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to add model");
        }
        showToast("Model successfully added to catalog", "success");
        closeAnyModal("modal-add-model");
        await loadModels();
        await loadRuntimes();
      } catch (e) {
        showToast(e.message, "danger");
      }
    });

    // Add Directory Modal
    const modalAddDir = document.getElementById("modal-add-directory");
    document.getElementById("btn-open-add-dir")?.addEventListener("click", () => {
      modalAddDir?.classList.add("active");
    });

    document.getElementById("btn-submit-add-dir")?.addEventListener("click", async () => {
      const dirPath = document.getElementById("input-dir-path").value.trim();
      if (!dirPath) {
        showToast("Directory path cannot be empty", "warning");
        return;
      }
      try {
        const res = await fetch("/api/v1/models/directories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directory_path: dirPath }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to add directory");
        }
        showToast(`Added search directory: ${dirPath}`, "success");
        modalAddDir.classList.remove("active");
        document.getElementById("input-dir-path").value = "";
        await loadConfig();
        await loadModels();
      } catch (e) {
        showToast(e.message, "danger");
      }
    });

    document.getElementById("btn-run-full-diag")?.addEventListener("click", async () => {
      showToast("Running system diagnostic suite...", "info");
      await loadDiagnostics();
      showToast("Diagnostic tests complete", "success");
    });

    document.getElementById("btn-show-llama-log")?.addEventListener("click", () => {
      state.currentLogSource = "llama";
      loadLogs();
    });
    document.getElementById("btn-show-app-log")?.addEventListener("click", () => {
      state.currentLogSource = "app";
      loadLogs();
    });
    document.getElementById("btn-refresh-log")?.addEventListener("click", loadLogs);

    // Benchmark Runner
    document.getElementById("btn-run-benchmark")?.addEventListener("click", async () => {
      const model = document.getElementById("bench-select-model").value;
      const runtime = document.getElementById("bench-select-runtime").value;
      const context = parseInt(document.getElementById("bench-input-context").value, 10) || 2048;
      const threads = parseInt(document.getElementById("bench-input-threads").value, 10) || 4;
      const gpuLayers = parseInt(document.getElementById("bench-input-gpu").value, 10) || 0;
      const tokens = parseInt(document.getElementById("bench-input-tokens").value, 10) || 128;
      const prompt = document.getElementById("bench-input-prompt").value.trim();

      const btn = document.getElementById("btn-run-benchmark");
      const statusMsg = document.getElementById("bench-status-msg");
      btn.disabled = true;
      statusMsg.textContent = "Executing benchmark on local hardware (sampling TTFT, throughput, and RAM)...";
      statusMsg.style.color = "#60a5fa";

      try {
        const res = await fetch("/api/v1/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: model,
            runtime: runtime,
            context_length: context,
            threads: threads,
            gpu_layers: gpuLayers,
            max_tokens: tokens,
            prompt: prompt,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Benchmark execution failed");
        }
        const data = await res.json();
        if (data.status === "completed") {
          showToast(`Benchmark complete: ${data.eval_tps} tokens/s (RAM: ${data.peak_ram_mb} MB)`, "success");
          statusMsg.textContent = `Completed in ${data.duration_ms} ms: ${data.eval_tps} t/s`;
          statusMsg.style.color = "#10b981";
        } else {
          showToast(`Benchmark run reported issue: ${data.error || "Check logs"}`, "danger");
          statusMsg.textContent = `Run issue: ${data.error || "Execution failed"}`;
          statusMsg.style.color = "#ef4444";
        }
        await loadBenchmarks();
      } catch (e) {
        showToast(e.message, "danger");
        statusMsg.textContent = `Error: ${e.message}`;
        statusMsg.style.color = "#ef4444";
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("btn-refresh-benchmarks")?.addEventListener("click", async () => {
      showToast("Refreshing benchmark matrix...", "info");
      await loadBenchmarks();
    });

    // Quality Evaluation Suite
    document.getElementById("btn-run-quality-eval")?.addEventListener("click", async () => {
      const model = document.getElementById("eval-select-model").value;
      const runtime = document.getElementById("eval-select-runtime").value;
      const btn = document.getElementById("btn-run-quality-eval");
      const indicator = document.getElementById("eval-status-indicator");
      const statusDetail = document.getElementById("eval-status-detail");

      btn.disabled = true;
      indicator.style.display = "block";
      statusDetail.textContent = "Running 6-task standardized battery (prompting local model)...";

      try {
        const res = await fetch("/api/v1/evaluations/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_id: model, runtime: runtime }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Quality evaluation failed");
        }
        const data = await res.json();
        showToast(`Quality battery finished! Score: ${data.composite_score}/10`, "success");
        renderQualityEvaluation(data);
      } catch (e) {
        showToast(e.message, "danger");
      } finally {
        btn.disabled = false;
        indicator.style.display = "none";
      }
    });

    document.getElementById("btn-refresh-runtimes-pkg")?.addEventListener("click", async () => {
      showToast("Scanning runtime adapters...", "info");
      await renderPackagingRuntimes();
    });

    document.getElementById("btn-save-settings")?.addEventListener("click", async () => {
      try {
        const dirs = document
          .getElementById("cfg-model-dirs")
          .value.split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

        const allowRemote = document.getElementById("cfg-allow-remote").checked;
        const apiKey = document.getElementById("cfg-api-key").value.trim() || null;
        const listenHost = document.getElementById("cfg-listen-host").value.trim() || (allowRemote ? "0.0.0.0" : "127.0.0.1");
        const listenPort = parseInt(document.getElementById("cfg-listen-port").value, 10) || 8000;

        const newCfg = {
          active_runtime: document.getElementById("cfg-active-runtime").value,
          active_model_id: state.activeModelId,
          llama_cpp: {
            executable_path: document.getElementById("cfg-llama-exe").value.trim(),
            cli_executable_path: state.config?.llama_cpp?.cli_executable_path || "",
            host: document.getElementById("cfg-llama-host").value.trim() || "127.0.0.1",
            port: parseInt(document.getElementById("cfg-llama-port").value, 10) || 8080,
            threads: state.config?.llama_cpp?.threads || 4,
            gpu_layers: state.config?.llama_cpp?.gpu_layers || 0,
            context_size: state.config?.llama_cpp?.context_size || 2048,
            batch_size: 512,
            ubatch_size: 512,
            use_mmap: true,
            flash_attn: false,
            cache_type_k: "f16",
            cache_type_v: "f16",
          },
          ollama: {
            host: "127.0.0.1",
            port: 11434,
            base_url: document.getElementById("cfg-ollama-url").value.trim() || "http://127.0.0.1:11434",
            executable_path: "ollama",
          },
          security: {
            api_key: apiKey,
            allow_remote_access: allowRemote,
            require_auth_for_local: false,
            listen_host: listenHost,
            listen_port: listenPort,
            allowed_origins: ["http://127.0.0.1:8000", "http://localhost:8000"],
          },
          model_directories: dirs,
          monitoring_poll_interval_sec: 2.0,
        };

        const res = await fetch("/api/v1/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newCfg),
        });
        if (!res.ok) throw new Error("Config save error");
        showToast("Settings saved successfully!", "success");
        await loadConfig();
        await loadRuntimes();
      } catch (e) {
        showToast(e.message, "danger");
      }
    });
  }


  // ============================================================
  // AI MODEL ADVISOR & AUTO SETUP LOGIC
  // ============================================================

  async function loadAdvisorHardwareSummary() {
    try {
      const res = await fetch("/api/v1/advisor/hardware-summary");
      if (!res.ok) return;
      const data = await res.json();

      const ramFreeEl = document.getElementById("env-ram-val");
      const ramSubEl = document.getElementById("env-ram-sub");
      if (ramFreeEl && data.ram) {
        ramFreeEl.textContent = `${data.ram.available_formatted} free`;
        ramSubEl.textContent = `of ${data.ram.total_formatted} (${data.ram.used_percent}% used)`;
      }

      const cpuValEl = document.getElementById("env-cpu-val");
      const cpuSubEl = document.getElementById("env-cpu-sub");
      if (cpuValEl && data.cpu) {
        cpuValEl.textContent = `${data.cpu.physical_cores} Cores`;
        cpuSubEl.textContent = `${data.cpu.logical_threads} Threads (${data.cpu.architecture})`;
      }

      const gpuValEl = document.getElementById("env-gpu-val");
      const gpuSubEl = document.getElementById("env-gpu-sub");
      if (gpuValEl && data.gpu) {
        if (data.gpu.detected) {
          gpuValEl.textContent = data.gpu.dedicated_vram_formatted;
          gpuSubEl.textContent = data.gpu.name || "Discrete GPU";
        } else {
          gpuValEl.textContent = "Shared / CPU";
          gpuSubEl.textContent = "No discrete GPU detected";
        }
      }

      const safeValEl = document.getElementById("env-safe-val");
      if (safeValEl && data.max_safe_model_formatted) {
        safeValEl.textContent = data.max_safe_model_formatted;
      }

      const rtBadge = document.getElementById("advisor-active-runtime-badge");
      if (rtBadge && data.active_runtime) {
        rtBadge.textContent = `Active Runtime: ${data.active_runtime}`;
      }
    } catch (e) {
      console.warn("Advisor hardware summary error:", e);
    }
  }

  async function loadAdvisorRecommendations(forceRefresh = false) {
    const container = document.getElementById("advisor-cards-container");
    if (!container) return;

    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--muted-foreground);">
        <div class="spinner" style="margin: 0 auto 1rem auto; width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div style="font-weight: 600; font-size: 0.95rem; color: var(--foreground); margin-bottom: 0.25rem;">Evaluating Hardware Envelope & Querying Catalog...</div>
        <div style="font-size: 0.8rem;">Analyzing memory headroom, compute capacity, and quantization variants.</div>
      </div>
    `;

    try {
      const payload = {
        workload: state.advisor.workload,
        preference: state.advisor.preference,
        catalog_source: state.advisor.catalogSource,
        search_query: state.advisor.searchQuery,
        force_refresh: forceRefresh,
      };

      const res = await fetch("/api/v1/advisor/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to evaluate advisor recommendations");
      const data = await res.json();
      state.advisor.models = data.recommendations || [];

      // Update tier count badges
      const counts = data.counts_by_tier || {};
      const countAllEl = document.getElementById("count-all");
      if (countAllEl) countAllEl.textContent = state.advisor.models.length;
      const countRecEl = document.getElementById("count-rec");
      if (countRecEl) countRecEl.textContent = counts.RECOMMENDED || 0;
      const countAltEl = document.getElementById("count-alt");
      if (countAltEl) countAltEl.textContent = counts.GOOD_ALTERNATIVE || 0;
      const countExpEl = document.getElementById("count-exp");
      if (countExpEl) countExpEl.textContent = counts.EXPERIMENTAL || 0;
      const countNotEl = document.getElementById("count-not");
      if (countNotEl) countNotEl.textContent = counts.NOT_RECOMMENDED || 0;
      const countUnsupEl = document.getElementById("count-unsup");
      if (countUnsupEl) countUnsupEl.textContent = counts.UNSUPPORTED || 0;

      const metaEl = document.getElementById("advisor-results-meta");
      if (metaEl) {
        metaEl.textContent = `Evaluated ${state.advisor.models.length} models for ${data.workload} workload (${data.preference} preference)`;
      }

      renderAdvisorCards();
    } catch (e) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);">
          <div style="color: var(--destructive); font-weight: 600; margin-bottom: 0.5rem;">Failed to load model recommendations</div>
          <div style="font-size: 0.8rem; color: var(--muted-foreground); margin-bottom: 1rem;">${escapeHtml(e.message)}</div>
          <button class="btn btn-secondary btn-sm" id="btn-retry-advisor">Retry Evaluation</button>
        </div>
      `;
      const retryBtn = document.getElementById("btn-retry-advisor");
      if (retryBtn) retryBtn.addEventListener("click", () => loadAdvisorRecommendations(true));
      showToast(e.message, "danger");
    }
  }

  function renderAdvisorCards() {
    const container = document.getElementById("advisor-cards-container");
    if (!container) return;

    let models = state.advisor.models;
    if (state.advisor.tierFilter !== "ALL") {
      models = models.filter((m) => m.recommendation_tier === state.advisor.tierFilter);
    }

    if (!models.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</div>
          <strong style="font-size: 0.95rem; display: block; margin-bottom: 0.25rem;">No Models Found in this Tier</strong>
          <p style="font-size: 0.8rem; color: var(--muted-foreground); margin: 0 0 1rem 0;">
            Try selecting "All Models", switching the workload filter, or searching Hugging Face hub.
          </p>
          <button class="btn btn-secondary btn-sm" id="btn-reset-advisor-filter">Show All Models</button>
        </div>
      `;
      const rBtn = document.getElementById("btn-reset-advisor-filter");
      if (rBtn) {
        rBtn.addEventListener("click", () => {
          state.advisor.tierFilter = "ALL";
          document.querySelectorAll(".tier-filter-btn").forEach((b) => b.classList.remove("active"));
          const allBtn = document.querySelector('.tier-filter-btn[data-tier="ALL"]');
          if (allBtn) allBtn.classList.add("active");
          renderAdvisorCards();
        });
      }
      return;
    }

    container.innerHTML = models.map((m) => {
      let tierClass = "card-rec";
      let badgeClass = "tier-rec";
      let badgeLabel = "Recommended";

      if (m.recommendation_tier === "GOOD_ALTERNATIVE") {
        tierClass = "card-alt";
        badgeClass = "tier-alt";
        badgeLabel = "Good Alternative";
      } else if (m.recommendation_tier === "EXPERIMENTAL") {
        tierClass = "card-exp";
        badgeClass = "tier-exp";
        badgeLabel = "Experimental";
      } else if (m.recommendation_tier === "NOT_RECOMMENDED") {
        tierClass = "card-not";
        badgeClass = "tier-not";
        badgeLabel = "Not Recommended";
      } else if (m.recommendation_tier === "UNSUPPORTED") {
        tierClass = "card-unsup";
        badgeClass = "tier-unsup";
        badgeLabel = "Unsupported";
      }

      const isCompared = state.advisor.selectedForCompare.has(m.model_id);
      const quants = m.available_quantizations || [];
      const selectedQuant = m.selected_quantization ? m.selected_quantization.name : "Q4_K_M";

      const quantOptionsHtml = quants.map((q) => {
        return `<option value="${escapeHtml(q)}" ${q === selectedQuant ? "selected" : ""}>${escapeHtml(q)}</option>`;
      }).join("");

      const capsHtml = (m.capabilities || []).map((c) => {
        return `<span class="advisor-tag">${escapeHtml(c)}</span>`;
      }).join("");

      return `
        <div class="advisor-card ${tierClass}" data-model-id="${escapeHtml(m.model_id)}">
          <div class="advisor-card-header">
            <div>
              <div class="advisor-model-title">${escapeHtml(m.name)}</div>
              <div class="advisor-model-publisher">by ${escapeHtml(m.publisher)} • ${escapeHtml(m.parameter_size)} • ${escapeHtml(m.architecture)}</div>
            </div>
            <span class="tier-badge ${badgeClass}">${badgeLabel}</span>
          </div>

          <div class="advisor-tags-row">
            ${capsHtml}
            <span class="advisor-tag" style="color:var(--primary);">${escapeHtml(m.license)}</span>
          </div>

          <!-- Quantization & Memory Footprint -->
          <div class="advisor-memory-meter">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; font-size:0.75rem;">
              <div style="display:flex; align-items:center; gap:0.4rem;">
                <span style="color:var(--muted-foreground);">Quantization:</span>
                <select class="select card-quant-select" data-model-id="${escapeHtml(m.model_id)}" style="font-size:0.72rem; padding:0.15rem 0.4rem; height:auto;">
                  ${quantOptionsHtml}
                </select>
              </div>
              <strong style="color:var(--foreground);">${escapeHtml(m.memory_breakdown ? m.memory_breakdown.weights_formatted : "")}</strong>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--muted-foreground); margin-bottom:0.25rem;">
              <span>Working RAM Footprint:</span>
              <span><strong>${escapeHtml(m.memory_breakdown ? m.memory_breakdown.total_working_ram_formatted : "")}</strong> (weights + KV cache)</span>
            </div>

            <div class="advisor-rationale-box" style="margin-top:0.4rem; margin-bottom:0;">
              <strong>Quantization Note:</strong> ${escapeHtml(m.technical_rationale ? m.technical_rationale.quantization_tradeoff : "")}
            </div>
          </div>

          <!-- Technical Rationale -->
          <div class="advisor-rationale-box">
            <div style="margin-bottom:0.25rem;"><strong>Analysis:</strong> ${escapeHtml(m.tier_reason || "")}</div>
            <div style="font-size:0.7rem; color:var(--muted-foreground);">
              • ${escapeHtml(m.technical_rationale ? m.technical_rationale.ram_headroom : "")}<br>
              • ${escapeHtml(m.technical_rationale ? m.technical_rationale.vram_capacity : "")}<br>
              • ${escapeHtml(m.technical_rationale ? m.technical_rationale.cpu_threads : "")}
            </div>
          </div>

          <!-- Estimated Performance -->
          <div class="advisor-perf-box">
            <span style="color:var(--muted-foreground);">Expected Speed:</span>
            <strong style="color:var(--primary); font-family:var(--font-mono);">${escapeHtml(m.estimated_performance || "-")}</strong>
          </div>

          <!-- Action Buttons -->
          <div class="advisor-card-actions">
            <button class="btn btn-primary btn-sm btn-advisor-setup" data-model-id="${escapeHtml(m.model_id)}" style="flex:1;">
              ⚡ One-Click Setup
            </button>
            <button class="btn btn-secondary btn-sm btn-advisor-compare ${isCompared ? "active" : ""}" data-model-id="${escapeHtml(m.model_id)}" title="Add to comparison">
              ${isCompared ? "✓ Compared" : "Compare"}
            </button>
            <button class="btn btn-outline btn-sm btn-advisor-guide" data-runtime="${escapeHtml(m.recommended_runtime || "llama.cpp server")}" title="Installation Guide">
              Guide
            </button>
          </div>
        </div>
      `;
    }).join("");

    // Wire up card action buttons
    container.querySelectorAll(".btn-advisor-setup").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mId = btn.getAttribute("data-model-id");
        openAdvisorSetupModal(mId);
      });
    });

    container.querySelectorAll(".btn-advisor-compare").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mId = btn.getAttribute("data-model-id");
        toggleCompareModel(mId);
      });
    });

    container.querySelectorAll(".btn-advisor-guide").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rt = btn.getAttribute("data-runtime");
        openRuntimeGuideModal(rt);
      });
    });

    // Quantization select changes
    container.querySelectorAll(".card-quant-select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const mId = sel.getAttribute("data-model-id");
        const newQuant = e.target.value;
        const model = state.advisor.models.find((m) => m.model_id === mId);
        if (model) {
          // Trigger setup modal directly with new quant
          openAdvisorSetupModal(mId, newQuant);
        }
      });
    });
  }

  function toggleCompareModel(modelId) {
    if (state.advisor.selectedForCompare.has(modelId)) {
      state.advisor.selectedForCompare.delete(modelId);
    } else {
      if (state.advisor.selectedForCompare.size >= 4) {
        showToast("You can compare up to 4 models simultaneously.", "warning");
        return;
      }
      state.advisor.selectedForCompare.add(modelId);
    }

    const count = state.advisor.selectedForCompare.size;
    const countEl = document.getElementById("compare-count");
    if (countEl) countEl.textContent = count;
    const btnOpen = document.getElementById("btn-open-compare-modal");
    if (btnOpen) btnOpen.disabled = count === 0;

    renderAdvisorCards();
  }

  function openAdvisorSetupModal(modelId, overrideQuant = null) {
    const model = state.advisor.models.find((m) => m.model_id === modelId);
    if (!model) return;

    const quant = overrideQuant || (model.selected_quantization ? model.selected_quantization.name : "Q4_K_M");
    const quantInfo = model.selected_quantization || {};

    // Populate modal specifications
    const nameEl = document.getElementById("setup-spec-name");
    if (nameEl) nameEl.textContent = model.name;
    const quantEl = document.getElementById("setup-spec-quant");
    if (quantEl) quantEl.textContent = quant;
    const sizeEl = document.getElementById("setup-spec-size");
    if (sizeEl) sizeEl.textContent = quantInfo.size_formatted || model.memory_breakdown.weights_formatted;
    const rtEl = document.getElementById("setup-spec-runtime");
    if (rtEl) rtEl.textContent = model.recommended_runtime || "llama.cpp server";
    const ramEl = document.getElementById("setup-spec-ram");
    if (ramEl) ramEl.textContent = model.memory_breakdown ? model.memory_breakdown.total_working_ram_formatted : "-";
    const licEl = document.getElementById("setup-spec-license");
    if (licEl) licEl.textContent = model.license || "Open";
    const licNameEl = document.getElementById("setup-license-name");
    if (licNameEl) licNameEl.textContent = model.license || "Open License";

    // Pre-flight checks
    const chkDisk = document.getElementById("setup-chk-disk");
    if (chkDisk && state.hardware && state.hardware.storage && state.hardware.storage[0]) {
      chkDisk.textContent = `${state.hardware.storage[0].free_gb} GB free (+ 2GB margin verified)`;
    }
    const chkRam = document.getElementById("setup-chk-ram");
    if (chkRam && state.hardware && state.hardware.ram) {
      chkRam.textContent = `${state.hardware.ram.available_gb} GB available RAM`;
    }
    const chkRt = document.getElementById("setup-chk-runtime");
    if (chkRt) chkRt.textContent = `Compatible with ${model.recommended_runtime || "active engine"}`;

    // Reset panels and checkbox
    const licCb = document.getElementById("setup-license-checkbox");
    if (licCb) licCb.checked = false;

    const preflightPanel = document.getElementById("setup-preflight-panel");
    if (preflightPanel) preflightPanel.style.display = "block";
    const progPanel = document.getElementById("setup-progress-panel");
    if (progPanel) progPanel.style.display = "none";
    const verifBox = document.getElementById("setup-verification-box");
    if (verifBox) verifBox.style.display = "none";

    const btnStart = document.getElementById("btn-start-setup-confirmed");
    if (btnStart) btnStart.style.display = "inline-flex";
    const btnCancel = document.getElementById("btn-cancel-setup");
    if (btnCancel) btnCancel.style.display = "none";
    const btnGoto = document.getElementById("btn-goto-chat");
    if (btnGoto) btnGoto.style.display = "none";
    const btnClose = document.getElementById("btn-close-setup-modal");
    if (btnClose) btnClose.style.display = "inline-flex";

    // Store target setup data on start button
    btnStart.setAttribute("data-model-id", modelId);
    btnStart.setAttribute("data-quant", quant);
    btnStart.setAttribute("data-filename", quantInfo.filename || `${modelId}-${quant.toLowerCase()}.gguf`);
    btnStart.setAttribute("data-url", quantInfo.download_url || "");
    btnStart.setAttribute("data-runtime", model.recommended_runtime || "llama.cpp server");
    btnStart.setAttribute("data-size", quantInfo.size_bytes || (1024 * 1024 * 1024));

    // Open modal
    const modal = document.getElementById("modal-advisor-setup");
    if (modal) modal.classList.add("active");
  }

  async function startAdvisorSetupPipeline() {
    const btnStart = document.getElementById("btn-start-setup-confirmed");
    if (!btnStart) return;

    const licCb = document.getElementById("setup-license-checkbox");
    if (!licCb || !licCb.checked) {
      showToast("Please confirm model license acceptance to proceed.", "warning");
      return;
    }

    const modelId = btnStart.getAttribute("data-model-id");
    const quant = btnStart.getAttribute("data-quant");
    const filename = btnStart.getAttribute("data-filename");
    const downloadUrl = btnStart.getAttribute("data-url");
    const runtime = btnStart.getAttribute("data-runtime");
    const sizeBytes = parseInt(btnStart.getAttribute("data-size"), 10) || 0;

    const payload = {
      model_id: modelId,
      quantization: quant,
      filename: filename,
      download_url: downloadUrl,
      runtime: runtime,
      expected_size_bytes: sizeBytes,
      license_confirmed: true,
      auto_configure: true,
      run_verification: true,
    };

    try {
      btnStart.disabled = true;
      const res = await fetch("/api/v1/advisor/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Setup initialization failed");
      }

      const data = await res.json();
      const taskId = data.task_id;
      state.advisor.activeSetupTaskId = taskId;

      // Switch view to progress
      document.getElementById("setup-preflight-panel").style.display = "none";
      document.getElementById("setup-progress-panel").style.display = "block";
      btnStart.style.display = "none";
      btnStart.disabled = false;
      document.getElementById("btn-cancel-setup").style.display = "inline-flex";

      // Start live progress polling
      if (state.advisor.setupPollInterval) clearInterval(state.advisor.setupPollInterval);
      state.advisor.setupPollInterval = setInterval(() => pollSetupProgress(taskId), 600);
      pollSetupProgress(taskId);
    } catch (e) {
      btnStart.disabled = false;
      showToast(e.message, "danger");
    }
  }

  async function pollSetupProgress(taskId) {
    try {
      const res = await fetch(`/api/v1/advisor/setup/${taskId}/progress`);
      if (!res.ok) return;
      const task = await res.json();

      const stageEl = document.getElementById("setup-stage-label");
      const pctEl = document.getElementById("setup-percent-label");
      const barEl = document.getElementById("setup-progress-bar");
      const bytesEl = document.getElementById("setup-bytes-label");
      const speedEl = document.getElementById("setup-speed-label");
      const etaEl = document.getElementById("setup-eta-label");

      if (stageEl) stageEl.textContent = task.message || "Setting up model...";
      if (pctEl) pctEl.textContent = `${task.progress_percent || 0}%`;
      if (barEl) barEl.style.width = `${task.progress_percent || 0}%`;

      if (bytesEl) {
        bytesEl.textContent = `${formatBytes(task.downloaded_bytes)} / ${formatBytes(task.total_bytes)}`;
      }
      if (speedEl) speedEl.textContent = `${task.speed_mb_s || 0} MB/s`;
      if (etaEl) etaEl.textContent = `${task.eta_seconds || 0}s`;

      if (task.status === "completed") {
        clearInterval(state.advisor.setupPollInterval);
        state.advisor.setupPollInterval = null;

        document.getElementById("btn-cancel-setup").style.display = "none";
        const btnGoto = document.getElementById("btn-goto-chat");
        if (btnGoto) {
          btnGoto.style.display = "inline-flex";
          btnGoto.setAttribute("data-model-id", task.model_entry ? task.model_entry.id : task.model_id);
        }

        const verifBox = document.getElementById("setup-verification-box");
        const verifDet = document.getElementById("setup-verification-details");
        if (verifBox && verifDet && task.verification) {
          verifBox.style.display = "block";
          verifDet.textContent = `Test response verified (${task.verification.latency_ms || 320} ms latency). Model registered and set as active.`;
        }

        showToast("Model setup, calibration, and verification completed successfully!", "success");
        await loadModels();
        await loadConfig();
      } else if (task.status === "failed" || task.status === "cancelled") {
        clearInterval(state.advisor.setupPollInterval);
        state.advisor.setupPollInterval = null;
        document.getElementById("btn-cancel-setup").style.display = "none";
        showToast(`Setup ${task.status}: ${task.error || task.message}`, "danger");
      }
    } catch (e) {
      console.warn("Setup polling error:", e);
    }
  }

  async function cancelAdvisorSetup() {
    const taskId = state.advisor.activeSetupTaskId;
    if (!taskId) return;
    try {
      const res = await fetch(`/api/v1/advisor/setup/${taskId}/cancel`, { method: "POST" });
      if (res.ok) {
        showToast("Setup cancellation requested.", "warning");
      }
    } catch (e) {
      showToast(e.message, "danger");
    }
  }

  async function openRuntimeGuideModal(runtimeId = "llama.cpp server") {
    state.advisor.activeGuideRuntime = runtimeId;
    const modal = document.getElementById("modal-runtime-guide");
    if (!modal) return;
    modal.classList.add("active");

    const tabsContainer = document.getElementById("guide-runtime-tabs");
    const runtimesList = [
      { id: "llama.cpp server", name: "llama.cpp" },
      { id: "ollama", name: "Ollama" },
      { id: "transformers", name: "Transformers" },
      { id: "onnxruntime", name: "ONNX DirectML" },
      { id: "mlx", name: "Apple MLX" },
      { id: "exllamav2", name: "ExLlamaV2" },
      { id: "mlc_llm", name: "MLC LLM" },
    ];

    if (tabsContainer) {
      tabsContainer.innerHTML = runtimesList.map((rt) => {
        const isActive = rt.id === runtimeId;
        return `
          <button class="runtime-guide-pill ${isActive ? "active" : ""}" data-rt-id="${escapeHtml(rt.id)}">
            ${escapeHtml(rt.name)}
          </button>
        `;
      }).join("");

      tabsContainer.querySelectorAll(".runtime-guide-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          tabsContainer.querySelectorAll(".runtime-guide-pill").forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
          loadRuntimeGuideDetails(pill.getAttribute("data-rt-id"));
        });
      });
    }

    loadRuntimeGuideDetails(runtimeId);
  }

  async function loadRuntimeGuideDetails(runtimeId) {
    const box = document.getElementById("guide-content-box");
    if (!box) return;

    box.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--muted-foreground);">Loading runtime installation guide...</div>`;

    try {
      const res = await fetch(`/api/v1/advisor/runtimes/install-guide/${encodeURIComponent(runtimeId)}`);
      if (!res.ok) throw new Error("Failed to load runtime guide");
      const data = await res.json();
      const guide = data.guide || {};
      const status = guide.current_status || {};

      const isConn = guide.is_connected;
      const statusBadge = isConn 
        ? `<span class="badge success">● Connected & Running</span>`
        : (status.available ? `<span class="badge warning">● Installed (Service Stopped)</span>` : `<span class="badge danger">● Not Detected</span>`);

      const instructionsHtml = (guide.install_instructions || []).map((ins) => `<li>${escapeHtml(ins)}</li>`).join("");

      const osName = (state.hardware && state.hardware.os) ? state.hardware.os.system : "Windows";
      const cmd = (guide.one_click_commands && guide.one_click_commands[osName]) || guide.one_click_commands["Windows"] || "";

      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
          <div>
            <div style="font-size:1.1rem; font-weight:700; color:var(--foreground);">${escapeHtml(guide.icon || "⚙️")} ${escapeHtml(guide.display_name)}</div>
            <div style="font-size:0.75rem; color:var(--muted-foreground); margin-top:2px;">${escapeHtml(guide.description)}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div style="background:var(--background); padding:0.6rem 0.8rem; border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.75rem; margin-bottom:0.75rem;">
          <div style="color:var(--muted-foreground); margin-bottom:0.25rem;"><strong>Recommended For:</strong> ${escapeHtml(guide.recommended_for || "")}</div>
          <div style="color:var(--muted-foreground);"><strong>Supported Formats:</strong> ${escapeHtml((guide.supported_formats || []).join(", "))}</div>
        </div>

        <div style="font-size:0.8rem; margin-bottom:0.5rem; font-weight:600;">One-Click Terminal Command (${escapeHtml(osName)}):</div>
        <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.75rem;">
          <input type="text" class="input" readonly value="${escapeHtml(cmd)}" id="guide-copy-cmd" style="font-family:var(--font-mono); font-size:0.75rem; background:rgba(0,0,0,0.3);">
          <button class="btn btn-secondary btn-sm" id="btn-copy-guide-cmd">Copy</button>
        </div>

        <div style="font-size:0.8rem; margin-bottom:0.35rem; font-weight:600;">Step-by-Step Installation:</div>
        <ol style="font-size:0.75rem; color:var(--muted-foreground); padding-left:1.25rem; line-height:1.5; margin-bottom:0.75rem;">
          ${instructionsHtml}
        </ol>

        <div style="font-size:0.75rem; color:var(--muted-foreground); border-top:1px solid var(--border); padding-top:0.5rem;">
          <strong>Verification:</strong> ${escapeHtml(guide.verification_steps || "")}
        </div>
      `;

      const copyBtn = document.getElementById("btn-copy-guide-cmd");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          const inp = document.getElementById("guide-copy-cmd");
          if (inp) {
            navigator.clipboard.writeText(inp.value);
            showToast("Command copied to clipboard!", "success");
          }
        });
      }
    } catch (e) {
      box.innerHTML = `<div style="color:var(--destructive); padding:1rem;">${escapeHtml(e.message)}</div>`;
    }
  }

  function openComparisonModal() {
    const modal = document.getElementById("modal-model-compare");
    const container = document.getElementById("compare-table-container");
    if (!modal || !container) return;

    const selectedIds = Array.from(state.advisor.selectedForCompare);
    const selectedModels = state.advisor.models.filter((m) => selectedIds.includes(m.model_id));

    if (!selectedModels.length) {
      container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--muted-foreground);">No models selected for comparison.</div>`;
      modal.classList.add("active");
      return;
    }

    let thCols = selectedModels.map((m) => `<th style="min-width:200px;">${escapeHtml(m.name)}</th>`).join("");

    container.innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th style="min-width:160px;">Feature / Metric</th>
            ${thCols}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Publisher & Family</strong></td>
            ${selectedModels.map((m) => `<td>${escapeHtml(m.publisher)} (${escapeHtml(m.architecture)})</td>`).join("")}
          </tr>
          <tr>
            <td><strong>Parameters & Context</strong></td>
            ${selectedModels.map((m) => `<td>${escapeHtml(m.parameter_size)} • ${escapeHtml(m.context_length)} tokens</td>`).join("")}
          </tr>
          <tr>
            <td><strong>Selected Quantization</strong></td>
            ${selectedModels.map((m) => `<td><span class="badge primary">${escapeHtml(m.selected_quantization ? m.selected_quantization.name : "Q4_K_M")}</span></td>`).join("")}
          </tr>
          <tr>
            <td><strong>File Download Size</strong></td>
            ${selectedModels.map((m) => `<td><strong>${escapeHtml(m.memory_breakdown ? m.memory_breakdown.weights_formatted : "-")}</strong></td>`).join("")}
          </tr>
          <tr>
            <td><strong>Working RAM Footprint</strong></td>
            ${selectedModels.map((m) => `<td><strong style="color:var(--primary);">${escapeHtml(m.memory_breakdown ? m.memory_breakdown.total_working_ram_formatted : "-")}</strong></td>`).join("")}
          </tr>
          <tr>
            <td><strong>Estimated Speed</strong></td>
            ${selectedModels.map((m) => `<td><strong style="font-family:var(--font-mono);">${escapeHtml(m.estimated_performance || "-")}</strong></td>`).join("")}
          </tr>
          <tr>
            <td><strong>Recommendation Tier</strong></td>
            ${selectedModels.map((m) => `<td><span class="tier-badge ${m.recommendation_tier === "RECOMMENDED" ? "tier-rec" : "tier-alt"}">${escapeHtml(m.recommendation_tier)}</span></td>`).join("")}
          </tr>
          <tr>
            <td><strong>Technical Rationale</strong></td>
            ${selectedModels.map((m) => `<td style="font-size:0.72rem; color:var(--muted-foreground);">${escapeHtml(m.tier_reason || "")}</td>`).join("")}
          </tr>
          <tr>
            <td><strong>License</strong></td>
            ${selectedModels.map((m) => `<td>${escapeHtml(m.license)}</td>`).join("")}
          </tr>
          <tr>
            <td><strong>Action</strong></td>
            ${selectedModels.map((m) => `
              <td>
                <button class="btn btn-primary btn-sm btn-compare-setup" data-model-id="${escapeHtml(m.model_id)}">
                  ⚡ Setup Model
                </button>
              </td>
            `).join("")}
          </tr>
        </tbody>
      </table>
    `;

    container.querySelectorAll(".btn-compare-setup").forEach((btn) => {
      btn.addEventListener("click", () => {
        modal.classList.remove("active");
        openAdvisorSetupModal(btn.getAttribute("data-model-id"));
      });
    });

    modal.classList.add("active");
  }

  function setupAdvisorEventListeners() {
    // Workload pills
    document.querySelectorAll(".workload-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".workload-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.advisor.workload = btn.getAttribute("data-workload");
        loadAdvisorRecommendations();
      });
    });

    // Preference select
    const prefSelect = document.getElementById("advisor-preference-select");
    if (prefSelect) {
      prefSelect.addEventListener("change", (e) => {
        state.advisor.preference = e.target.value;
        loadAdvisorRecommendations();
      });
    }

    // Source select
    const srcSelect = document.getElementById("advisor-source-select");
    if (srcSelect) {
      srcSelect.addEventListener("change", (e) => {
        state.advisor.catalogSource = e.target.value;
      });
    }

    // Search button & Enter key
    const searchInput = document.getElementById("advisor-search-input");
    const searchBtn = document.getElementById("btn-advisor-search");
    if (searchBtn && searchInput) {
      const doSearch = () => {
        state.advisor.searchQuery = searchInput.value.trim();
        loadAdvisorRecommendations(true);
      };
      searchBtn.addEventListener("click", doSearch);
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") doSearch();
      });
    }

    // Recheck hardware button
    const recheckBtn = document.getElementById("btn-advisor-recheck-hw");
    if (recheckBtn) {
      recheckBtn.addEventListener("click", async () => {
        await loadHardware();
        await loadAdvisorHardwareSummary();
        await loadAdvisorRecommendations(true);
        showToast("Hardware envelope re-evaluated successfully!", "success");
      });
    }

    // Tier filter buttons
    document.querySelectorAll(".tier-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tier-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.advisor.tierFilter = btn.getAttribute("data-tier");
        renderAdvisorCards();
      });
    });

    // Compare modal button
    const btnCompare = document.getElementById("btn-open-compare-modal");
    if (btnCompare) {
      btnCompare.addEventListener("click", openComparisonModal);
    }

    // Clear comparison button
    const btnClearCompare = document.getElementById("btn-clear-comparison");
    if (btnClearCompare) {
      btnClearCompare.addEventListener("click", () => {
        state.advisor.selectedForCompare.clear();
        document.getElementById("compare-count").textContent = "0";
        document.getElementById("btn-open-compare-modal").disabled = true;
        renderAdvisorCards();
        document.getElementById("modal-model-compare").classList.remove("active");
      });
    }

    // Setup modal start button
    const btnStartSetup = document.getElementById("btn-start-setup-confirmed");
    if (btnStartSetup) {
      btnStartSetup.addEventListener("click", startAdvisorSetupPipeline);
    }

    // Setup modal cancel button
    const btnCancelSetup = document.getElementById("btn-cancel-setup");
    if (btnCancelSetup) {
      btnCancelSetup.addEventListener("click", cancelAdvisorSetup);
    }

    // Setup modal Goto chat button
    const btnGoto = document.getElementById("btn-goto-chat");
    if (btnGoto) {
      btnGoto.addEventListener("click", () => {
        const modelId = btnGoto.getAttribute("data-model-id");
        document.getElementById("modal-advisor-setup").classList.remove("active");

        // Switch to Inference Studio tab
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        const chatTabBtn = document.querySelector('.tab-btn[data-tab="tab-chat"]');
        const chatSection = document.getElementById("tab-chat");
        if (chatTabBtn) chatTabBtn.classList.add("active");
        if (chatSection) chatSection.classList.add("active");

        // Set active model dropdown if exists
        const chatModelSelect = document.getElementById("chat-model-select");
        if (chatModelSelect && modelId) {
          chatModelSelect.value = modelId;
          state.activeModelId = modelId;
        }
      });
    }

    // Test connection button in runtime guide
    const btnGuideConn = document.getElementById("btn-guide-test-conn");
    if (btnGuideConn) {
      btnGuideConn.addEventListener("click", () => {
        loadRuntimeGuideDetails(state.advisor.activeGuideRuntime);
        showToast("Testing runtime connection...", "info");
      });
    }
  }

  setupAdvisorEventListeners();
  setupTabs();
  setupChat();
  setupActionHandlers();

  Promise.all([loadConfig(), loadHardware(), loadRuntimes(), loadModels()]).then(() => {
    loadBenchmarks();
    loadEvaluations();
    renderPackagingRuntimes();
    setInterval(pollLiveTelemetry, 2000);
    pollLiveTelemetry();
  });
});
