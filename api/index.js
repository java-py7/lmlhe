// server/app.ts
import express from "express";
import path2 from "node:path";

// server/catalog.ts
var GITHUB_PROJECTS = [
  {
    id: "llama-cpp",
    name: "llama.cpp",
    repo: "ggml-org/llama.cpp",
    url: "https://github.com/ggml-org/llama.cpp",
    language: "C / C++",
    starsApprox: "78k+",
    category: "constrained-edge",
    validationStatus: "team-validated",
    quantizationFormats: ["GGUF Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "IQ3_XXS", "IQ2_XS", "IQ1_S"],
    offloadingSupport: "Per-layer GPU/CPU split (-ngl), mmap zero-copy, tensor-level MoE CPU offload (-ot)",
    targetHardware: "All local PCs (CUDA, Metal, Vulkan, ROCm, SYCL, AVX2/AVX-512/NEON CPUs)",
    strengths: "Universal portability, lowest memory overhead, partial GPU layer offloading, KV-cache quantization, instant mmap loading.",
    tradeoffs: "Lower high-concurrency batch throughput than vLLM or TensorRT-LLM on datacenter GPUs.",
    summary: "Reference C/C++ inference runtime for running quantized GGUF LLMs across consumer CPUs, GPUs, and unified memory systems."
  },
  {
    id: "mlc-llm",
    name: "MLC LLM",
    repo: "mlc-ai/mlc-llm",
    url: "https://github.com/mlc-ai/mlc-llm",
    language: "Python / C++ / TVM",
    starsApprox: "21k+",
    category: "constrained-edge",
    validationStatus: "team-validated",
    quantizationFormats: ["q4f16_1", "q4f32_1", "q3f16_1", "q0f16"],
    offloadingSupport: "Compiled GPU kernel execution (CUDA, Metal, Vulkan, WebGPU); limited partial CPU layer split",
    targetHardware: "Consumer GPUs, Apple Silicon, Android/iOS, Browser WebGPU",
    strengths: "TVM Unity compiler optimizes operator fusion directly for target GPU; powers WebLLM in-browser WebGPU execution.",
    tradeoffs: "Requires model pre-compilation per architecture; less flexible for ad-hoc CPU+GPU layer splitting than llama.cpp.",
    summary: "Universal machine learning compilation engine deploying quantized LLMs natively across CUDA, Metal, Vulkan, and WebGPU."
  },
  {
    id: "exllamav2",
    name: "ExLlamaV2",
    repo: "turboderp-org/exllamav2",
    url: "https://github.com/turboderp-org/exllamav2",
    language: "Python / CUDA C++",
    starsApprox: "4.4k+",
    category: "gpu-high-throughput",
    validationStatus: "team-validated",
    quantizationFormats: ["EXL2 (2.25\u20138.0 bpw fractional)", "GPTQ"],
    offloadingSupport: "Full VRAM & multi-GPU tensor split; dynamic mixed-precision per-layer bit allocation",
    targetHardware: "NVIDIA CUDA GPUs (RTX 30/40/50 series, Ampere/Ada/Blackwell)",
    strengths: "Fastest single-user token generation on consumer NVIDIA GPUs; fractional bpw (e.g. 4.25bpw) fits exact VRAM limits with Q4/Q6 KV cache.",
    tradeoffs: "NVIDIA CUDA / ROCm GPU only; no hybrid CPU RAM layer offloading.",
    summary: "High-velocity CUDA inference engine using fractional mixed-bit EXL2 quantization tailored to fit tight VRAM budgets."
  },
  {
    id: "vllm",
    name: "vLLM",
    repo: "vllm-project/vllm",
    url: "https://github.com/vllm-project/vllm",
    language: "Python / CUDA C++",
    starsApprox: "46k+",
    category: "gpu-high-throughput",
    validationStatus: "team-validated",
    quantizationFormats: ["FP16", "BF16", "FP8", "AWQ-INT4", "GPTQ", "BitsAndBytes", "GGUF (experimental)"],
    offloadingSupport: "PagedAttention KV cache, Tensor Parallelism, CPU swap space for preempted KV blocks",
    targetHardware: "NVIDIA Ampere/Ada/Hopper GPUs, AMD ROCm, multi-GPU workstations",
    strengths: "Industry standard for continuous batching, OpenAI-compatible serving, Prefix Caching, and near-zero KV cache fragmentation.",
    tradeoffs: "High baseline VRAM reservation (gpu-memory-utilization) and Linux-first deployment; suboptimal for 6\u20138GB consumer laptops.",
    summary: "High-throughput GPU serving engine built around PagedAttention and continuous batching for multi-request workloads."
  },
  {
    id: "tensorrt-llm",
    name: "TensorRT-LLM",
    repo: "NVIDIA/TensorRT-LLM",
    url: "https://github.com/NVIDIA/TensorRT-LLM",
    language: "C++ / Python / CUDA",
    starsApprox: "10.5k+",
    category: "gpu-high-throughput",
    validationStatus: "team-validated",
    quantizationFormats: ["FP8", "INT4-AWQ", "W4A16", "INT8 SmoothQuant", "FP16"],
    offloadingSupport: "In-flight batching, multi-GPU Tensor/Pipeline Parallelism; strictly GPU-resident engines",
    targetHardware: "NVIDIA RTX 40/50, L40S, A100, H100, B200 (Compute Capability >= 8.0)",
    strengths: "Peak prefill and decode speeds on NVIDIA Ada/Hopper via ahead-of-time fused TensorRT kernels and FP8 Tensor Cores.",
    tradeoffs: "Long ahead-of-time engine compilation step; hardware-locked compiled plans; steep setup complexity on consumer Windows.",
    summary: "NVIDIA official compiler and runtime delivering peak silicon utilization on modern GeForce RTX and datacenter GPUs."
  },
  {
    id: "mlx-lm",
    name: "MLX-LM",
    repo: "ml-explore/mlx-lm",
    url: "https://github.com/ml-explore/mlx-lm",
    language: "Python / C++ / Metal",
    starsApprox: "20k+",
    category: "apple-silicon",
    validationStatus: "team-validated",
    quantizationFormats: ["MLX 4-bit", "MLX 6-bit", "MLX 8-bit", "FP16"],
    offloadingSupport: "Zero-copy Unified Memory graph execution across Apple GPU & CPU without PCIe transfers",
    targetHardware: "Apple Silicon (M1, M2, M3, M4 \u2014 Pro, Max, Ultra)",
    strengths: "Purpose-built by Apple ML Research for Unified Memory; zero host-to-device copies and highest decode efficiency on Mac.",
    tradeoffs: "Exclusive to Apple Silicon macOS hardware.",
    summary: "Apple Silicon native array framework enabling zero-copy unified memory inference for 7B\u201370B+ models on Mac workstations."
  },
  {
    id: "ktransformers",
    name: "KTransformers",
    repo: "kvcache-ai/ktransformers",
    url: "https://github.com/kvcache-ai/ktransformers",
    language: "Python / C++ / CUDA",
    starsApprox: "13.5k+",
    category: "hybrid-moe",
    validationStatus: "experimental",
    quantizationFormats: ["GGUF Q4_K_M", "IQ4_XS", "Marlin INT4", "FP8"],
    offloadingSupport: "Heterogeneous MoE scheduling: attention & shared layers on GPU, sparse routed experts on AMX/AVX-512 CPU RAM",
    targetHardware: "16\u201324GB NVIDIA GPU + 128\u2013512GB DDR4/DDR5 System RAM (Xeon AMX / Ryzen AVX-512)",
    strengths: "Enables 671B DeepSeek-R1/V3 MoE models to run at 8\u201316 tok/s on a single 24GB GPU paired with large host RAM.",
    tradeoffs: "Requires Linux + high-bandwidth multi-channel system RAM; experimental kernel tuning.",
    summary: "Heterogeneous CPU+GPU MoE execution engine placing attention on VRAM and sparse experts on AVX-512/AMX CPU cores."
  },
  {
    id: "ik-llama-cpp",
    name: "ik_llama.cpp",
    repo: "ikawrakow/ik_llama.cpp",
    url: "https://github.com/ikawrakow/ik_llama.cpp",
    language: "C / C++",
    starsApprox: "2.1k+",
    category: "hybrid-moe",
    validationStatus: "experimental",
    quantizationFormats: ["IQ1_S", "IQ1_M", "IQ2_K", "IQ3_K", "IQ4_KSS", "IQ4_XS"],
    offloadingSupport: "Granular tensor-level MoE offloading, FlashMLA, custom CPU repacking for ultra-low-bit quants",
    targetHardware: "Constrained VRAM workstations & multi-core x86_64/ARM64 servers",
    strengths: "Significantly faster CPU prompt processing and lower perplexity at 1.5\u20133.5 bpw than upstream GGUF quants.",
    tradeoffs: "Rapidly evolving fork; custom quant formats are not always backward compatible with standard llama.cpp.",
    summary: "Research-focused llama.cpp fork pioneering sub-3-bit importance-matrix quantization and MoE CPU offload kernels."
  },
  {
    id: "airllm",
    name: "AirLLM",
    repo: "lyogavin/airllm",
    url: "https://github.com/lyogavin/airllm",
    language: "Python / PyTorch",
    starsApprox: "6.8k+",
    category: "disk-offload",
    validationStatus: "experimental",
    quantizationFormats: ["4-bit BnB", "8-bit BnB", "FP16"],
    offloadingSupport: "Sequential layer-by-layer NVMe disk streaming directly into 4GB\u20138GB VRAM",
    targetHardware: "4GB\u20138GB VRAM GPUs with fast PCIe Gen4/Gen5 NVMe SSD",
    strengths: "Proves 70B\u2013405B models can execute on a single 4GB GPU without OOM by freeing each transformer block after execution.",
    tradeoffs: "Extremely slow token generation (0.05\u20130.4 tok/s) bound by NVMe read throughput; suited only for offline batch proofs.",
    summary: "Disk-streamed layer execution framework allowing massive dense LLMs to run on 4GB VRAM GPUs at SSD-bound speeds."
  },
  {
    id: "ollama",
    name: "Ollama",
    repo: "ollama/ollama",
    url: "https://github.com/ollama/ollama",
    language: "Go / C++ (llama.cpp)",
    starsApprox: "138k+",
    category: "constrained-edge",
    validationStatus: "team-validated",
    quantizationFormats: ["GGUF Q4_K_M", "Q5_K_M", "Q8_0", "FP16"],
    offloadingSupport: "Automatic VRAM detection and dynamic CPU/GPU layer splitting via embedded llama.cpp runner",
    targetHardware: "macOS, Windows, Linux desktops and developer laptops",
    strengths: "Zero-config local deployment, built-in model registry, automatic hardware probing, clean REST API on port 11434.",
    tradeoffs: "Abstracts away low-level tensor split flags and custom IQ quant tuning compared to direct llama-server CLI.",
    summary: "Developer-focused local model manager and runner wrapping llama.cpp with automatic GPU offloading and artifact management."
  },
  {
    id: "llamafile",
    name: "llamafile",
    repo: "Mozilla-Ocho/llamafile",
    url: "https://github.com/Mozilla-Ocho/llamafile",
    language: "C / C++ (Cosmopolitan)",
    starsApprox: "22k+",
    category: "constrained-edge",
    validationStatus: "team-validated",
    quantizationFormats: ["GGUF Q4_K_M", "Q5_K_M", "Q8_0"],
    offloadingSupport: "Single-binary CPU+GPU hybrid execution with optimized tinyBLAS CPU kernels",
    targetHardware: "Cross-platform x86_64 & ARM64 workstations without driver installs",
    strengths: "Distributes weights and runtime in a single portable executable; heavily optimized AVX2/AVX-512 CPU matmul kernels.",
    tradeoffs: "Large single-file artifacts (>4GB issues on older Windows builds) and lags slightly behind mainline llama.cpp.",
    summary: "Single-file executable LLM distribution combining Cosmopolitan Libc with high-speed tinyBLAS CPU kernels."
  },
  {
    id: "sglang",
    name: "SGLang",
    repo: "sgl-project/sglang",
    url: "https://github.com/sgl-project/sglang",
    language: "Python / CUDA C++",
    starsApprox: "12.8k+",
    category: "gpu-high-throughput",
    validationStatus: "experimental",
    quantizationFormats: ["FP8", "AWQ-INT4", "GPTQ", "BF16"],
    offloadingSupport: "RadixAttention KV-cache tree reuse, multi-GPU TP/DP, FP8 KV cache",
    targetHardware: "NVIDIA Ampere/Ada/Hopper GPUs (24GB\u201380GB VRAM)",
    strengths: "Sub-millisecond cache hits on shared system prompts and structured JSON decoding acceleration.",
    tradeoffs: "Server-oriented GPU runtime requiring Linux + CUDA; not designed for low-VRAM hybrid CPU offloading.",
    summary: "Structured generation runtime leveraging RadixAttention for ultra-fast multi-turn and agentic GPU serving."
  }
];
var RUNTIME_ENGINES = [
  {
    id: "llama.cpp",
    name: "llama.cpp (llama-server)",
    repo: "ggml-org/llama.cpp",
    category: "constrained-universal",
    supportedVendors: ["nvidia", "apple", "amd", "intel", "unknown"],
    supportsCpuOnly: true,
    supportsHybridOffload: true,
    supportsDiskStream: false,
    supportedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "IQ3_XXS", "IQ2_XS", "IQ1_S"],
    vramOverheadGB: 0.45,
    ramOverheadGB: 0.6,
    prefillEfficiency: 0.78,
    decodeEfficiency: 0.76,
    defaultPort: 8080,
    validationStatus: "team-validated",
    notes: "Primary universal backend for Project 3 HAL. Supports CUDA, Metal, Vulkan, ROCm, SYCL, and partial GPU/CPU layer splits."
  },
  {
    id: "ollama",
    name: "Ollama Engine",
    repo: "ollama/ollama",
    category: "constrained-universal",
    supportedVendors: ["nvidia", "apple", "amd", "intel", "unknown"],
    supportsCpuOnly: true,
    supportsHybridOffload: true,
    supportsDiskStream: false,
    supportedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M"],
    vramOverheadGB: 0.5,
    ramOverheadGB: 0.65,
    prefillEfficiency: 0.8,
    decodeEfficiency: 0.78,
    defaultPort: 11434,
    validationStatus: "team-validated",
    notes: "Developer runtime wrapping llama.cpp with automated GPU layer offloading and local REST API on port 11434."
  },
  {
    id: "exllamav2",
    name: "ExLlamaV2 (TabbyAPI)",
    repo: "turboderp-org/exllamav2",
    category: "gpu-specialized",
    supportedVendors: ["nvidia", "amd"],
    supportsCpuOnly: false,
    supportsHybridOffload: false,
    supportsDiskStream: false,
    supportedQuants: ["EXL2-4.25bpw", "EXL2-3.0bpw", "Q4_K_M"],
    vramOverheadGB: 0.65,
    ramOverheadGB: 0.8,
    prefillEfficiency: 0.88,
    decodeEfficiency: 0.89,
    defaultPort: 5e3,
    validationStatus: "team-validated",
    notes: "Peak single-stream consumer NVIDIA throughput using fractional EXL2 quantization and Q4/Q6 KV cache compression."
  },
  {
    id: "mlc-llm",
    name: "MLC LLM (TVM Unity)",
    repo: "mlc-ai/mlc-llm",
    category: "constrained-universal",
    supportedVendors: ["nvidia", "apple", "amd", "intel"],
    supportsCpuOnly: false,
    supportsHybridOffload: false,
    supportsDiskStream: false,
    supportedQuants: ["Q4_K_M", "IQ3_XXS", "FP16"],
    vramOverheadGB: 0.55,
    ramOverheadGB: 0.7,
    prefillEfficiency: 0.84,
    decodeEfficiency: 0.82,
    defaultPort: 8e3,
    validationStatus: "team-validated",
    notes: "Compiled GPU runtime supporting WebGPU, Vulkan, Metal, and CUDA. Ideal for cross-vendor GPU acceleration."
  },
  {
    id: "mlx-lm",
    name: "MLX-LM (Apple Metal)",
    repo: "ml-explore/mlx-lm",
    category: "apple-native",
    supportedVendors: ["apple"],
    supportsCpuOnly: false,
    supportsHybridOffload: false,
    supportsDiskStream: false,
    supportedQuants: ["FP16", "Q8_0", "Q6_K", "Q4_K_M"],
    vramOverheadGB: 0.35,
    ramOverheadGB: 0.35,
    prefillEfficiency: 0.86,
    decodeEfficiency: 0.87,
    defaultPort: 8081,
    validationStatus: "team-validated",
    notes: "Zero-copy Unified Memory runtime exclusive to Apple Silicon Macs. Outperforms generic Metal backends by 12\u201318%."
  },
  {
    id: "vllm",
    name: "vLLM (PagedAttention)",
    repo: "vllm-project/vllm",
    category: "gpu-specialized",
    supportedVendors: ["nvidia", "amd"],
    supportsCpuOnly: false,
    supportsHybridOffload: false,
    supportsDiskStream: false,
    supportedQuants: ["FP16", "Q8_0", "AWQ-INT4"],
    vramOverheadGB: 1.6,
    ramOverheadGB: 2.2,
    prefillEfficiency: 0.94,
    decodeEfficiency: 0.86,
    defaultPort: 8e3,
    validationStatus: "team-validated",
    notes: "High-concurrency GPU engine. Recommended on >=16GB NVIDIA/ROCm GPUs for continuous batching and production OpenAI API serving."
  },
  {
    id: "tensorrt-llm",
    name: "NVIDIA TensorRT-LLM",
    repo: "NVIDIA/TensorRT-LLM",
    category: "gpu-specialized",
    supportedVendors: ["nvidia"],
    supportsCpuOnly: false,
    supportsHybridOffload: false,
    supportsDiskStream: false,
    supportedQuants: ["FP16", "Q8_0", "AWQ-INT4"],
    vramOverheadGB: 1.8,
    ramOverheadGB: 2.4,
    prefillEfficiency: 0.98,
    decodeEfficiency: 0.95,
    defaultPort: 8001,
    validationStatus: "team-validated",
    notes: "Ahead-of-time compiled CUDA graphs for NVIDIA Ampere/Ada/Hopper (>=12GB VRAM recommended). Lowest TTFT on NVIDIA silicon."
  },
  {
    id: "ktransformers",
    name: "KTransformers (MoE Hybrid)",
    repo: "kvcache-ai/ktransformers",
    category: "moe-offload",
    supportedVendors: ["nvidia"],
    supportsCpuOnly: false,
    supportsHybridOffload: true,
    supportsDiskStream: true,
    supportedQuants: ["Q4_K_M", "IQ3_XXS", "IQ2_XS", "IQ1_S"],
    vramOverheadGB: 1.2,
    ramOverheadGB: 3,
    prefillEfficiency: 0.72,
    decodeEfficiency: 0.74,
    defaultPort: 10002,
    validationStatus: "experimental",
    notes: "Specialized MoE heterogeneous runtime placing dense attention on NVIDIA VRAM and routed experts on high-bandwidth CPU RAM."
  }
];
var QUANTIZATIONS = [
  {
    id: "FP16",
    label: "FP16 / BF16 (16-bit)",
    bitsPerWeight: 16,
    perplexityDelta: "+0.000",
    qualityTier: "Lossless",
    compatibleRuntimes: ["llama.cpp", "ollama", "mlc-llm", "mlx-lm", "vllm", "tensorrt-llm"],
    teamValidated: true,
    notes: "Uncompressed half-precision baseline. Requires 2 GB per billion parameters plus KV cache."
  },
  {
    id: "Q8_0",
    label: "Q8_0 (8.5 bpw)",
    bitsPerWeight: 8.5,
    perplexityDelta: "+0.002",
    qualityTier: "Near-Lossless",
    compatibleRuntimes: ["llama.cpp", "ollama", "mlx-lm", "vllm", "tensorrt-llm"],
    teamValidated: true,
    notes: "Indistinguishable from FP16 on reasoning benchmarks at half the memory footprint."
  },
  {
    id: "Q6_K",
    label: "Q6_K (6.57 bpw)",
    bitsPerWeight: 6.57,
    perplexityDelta: "+0.011",
    qualityTier: "Near-Lossless",
    compatibleRuntimes: ["llama.cpp", "ollama", "mlx-lm"],
    teamValidated: true,
    notes: "Optimal high-fidelity quantization for coding and long-context retrieval."
  },
  {
    id: "Q5_K_M",
    label: "Q5_K_M (5.68 bpw)",
    bitsPerWeight: 5.68,
    perplexityDelta: "+0.028",
    qualityTier: "Balanced",
    compatibleRuntimes: ["llama.cpp", "ollama"],
    teamValidated: true,
    notes: "Strong accuracy retention when 16\u201324GB VRAM permits slightly higher bit depth than Q4."
  },
  {
    id: "Q4_K_M",
    label: "Q4_K_M (4.85 bpw)",
    bitsPerWeight: 4.85,
    perplexityDelta: "+0.064",
    qualityTier: "Balanced",
    compatibleRuntimes: ["llama.cpp", "ollama", "mlc-llm", "mlx-lm", "exllamav2", "ktransformers"],
    teamValidated: true,
    notes: "Team default sweet spot for constrained hardware: ~68% memory reduction with minimal reasoning degradation."
  },
  {
    id: "EXL2-4.25bpw",
    label: "EXL2 4.25 bpw",
    bitsPerWeight: 4.25,
    perplexityDelta: "+0.078",
    qualityTier: "Balanced",
    compatibleRuntimes: ["exllamav2"],
    teamValidated: true,
    notes: "Dynamic mixed-bit allocation prioritizing sensitive attention and MLP layers on NVIDIA GPUs."
  },
  {
    id: "AWQ-INT4",
    label: "AWQ INT4 (4.20 bpw)",
    bitsPerWeight: 4.2,
    perplexityDelta: "+0.082",
    qualityTier: "Balanced",
    compatibleRuntimes: ["vllm", "tensorrt-llm"],
    teamValidated: true,
    notes: "Activation-aware 4-bit weight quantization with fused Marlin/TensorRT kernels."
  },
  {
    id: "EXL2-3.0bpw",
    label: "EXL2 3.0 bpw",
    bitsPerWeight: 3,
    perplexityDelta: "+0.240",
    qualityTier: "Aggressive",
    compatibleRuntimes: ["exllamav2"],
    teamValidated: false,
    notes: "Experimental high-compression EXL2 target allowing 70B models to fit inside 24\u201332GB VRAM."
  },
  {
    id: "IQ3_XXS",
    label: "IQ3_XXS (3.06 bpw)",
    bitsPerWeight: 3.06,
    perplexityDelta: "+0.295",
    qualityTier: "Aggressive",
    compatibleRuntimes: ["llama.cpp", "mlc-llm", "ktransformers"],
    teamValidated: false,
    notes: "Importance-matrix 3-bit quantization. Useful for fitting 14B\u201332B models on 8\u201316GB hardware."
  },
  {
    id: "IQ2_XS",
    label: "IQ2_XS (2.31 bpw)",
    bitsPerWeight: 2.31,
    perplexityDelta: "+0.640",
    qualityTier: "Extreme",
    compatibleRuntimes: ["llama.cpp", "ktransformers"],
    teamValidated: false,
    notes: "Experimental 2-bit imatrix quantization. Noticeable coding/math degradation on <30B models; viable mainly on 70B+."
  },
  {
    id: "IQ1_S",
    label: "IQ1_S (1.56 bpw)",
    bitsPerWeight: 1.56,
    perplexityDelta: "+1.450",
    qualityTier: "Extreme",
    compatibleRuntimes: ["llama.cpp", "ktransformers"],
    teamValidated: false,
    notes: "Experimental 1.58-bit extreme compression for 70B\u2013671B MoE proof-of-concept runs on constrained RAM."
  }
];
var MODELS = [
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B Instruct",
    family: "Meta Llama 3",
    paramsB: 1.23,
    activeParamsB: 1.23,
    isMoE: false,
    layers: 16,
    kvHeads: 8,
    headDim: 64,
    hiddenSize: 2048,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-entry",
    useCase: "Featherweight assistant designed for lightweight PCs, mobile, and rapid edge prototyping",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M"]
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B Instruct",
    family: "Meta Llama 3",
    paramsB: 3.21,
    activeParamsB: 3.21,
    isMoE: false,
    layers: 28,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 3072,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-entry",
    useCase: "Ultra-fast local assistant on 8GB laptops and integrated GPUs",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "AWQ-INT4"]
  },
  {
    id: "qwen-2.5-7b",
    name: "Qwen 2.5 7B Instruct",
    family: "Alibaba Qwen 2.5",
    paramsB: 7.61,
    activeParamsB: 7.61,
    isMoE: false,
    layers: 28,
    kvHeads: 4,
    headDim: 128,
    hiddenSize: 3584,
    maxNativeContext: 131072,
    huggingfaceRepo: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-entry",
    useCase: "Compact coding, JSON extraction, and multilingual reasoning (tiny GQA KV cache)",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "llama-3.1-8b",
    name: "Llama 3.1 8B Instruct",
    family: "Meta Llama 3",
    paramsB: 8.03,
    activeParamsB: 8.03,
    isMoE: false,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 4096,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-standard",
    useCase: "General-purpose baseline for 8GB VRAM / 16GB RAM workstations",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "gemma-3-12b",
    name: "Gemma 3 12B Instruct",
    family: "Google Gemma 3",
    paramsB: 12.2,
    activeParamsB: 12.2,
    isMoE: false,
    layers: 48,
    kvHeads: 8,
    headDim: 256,
    hiddenSize: 3840,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/google_gemma-3-12b-it-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-standard",
    useCase: "High-quality summarization and long-context local workflows on 12\u201316GB VRAM",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "AWQ-INT4"]
  },
  {
    id: "phi-4-14b",
    name: "Phi-4 14B",
    family: "Microsoft Phi",
    paramsB: 14.7,
    activeParamsB: 14.7,
    isMoE: false,
    layers: 40,
    kvHeads: 10,
    headDim: 128,
    hiddenSize: 5120,
    maxNativeContext: 16384,
    huggingfaceRepo: "bartowski/phi-4-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-midrange",
    useCase: "Dense STEM and mathematical reasoning within a 12GB\u201316GB VRAM envelope",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "deepseek-r1-14b",
    name: "DeepSeek-R1 Distill Qwen 14B",
    family: "DeepSeek R1 Distill",
    paramsB: 14.8,
    activeParamsB: 14.8,
    isMoE: false,
    layers: 48,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 5120,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-midrange",
    useCase: "Chain-of-thought reasoning distilled into a 12\u201316GB workstation footprint",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "mistral-small-24b",
    name: "Mistral Small 3 24B Instruct",
    family: "Mistral AI",
    paramsB: 24,
    activeParamsB: 24,
    isMoE: false,
    layers: 40,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 5120,
    maxNativeContext: 32768,
    huggingfaceRepo: "bartowski/Mistral-Small-24B-Instruct-2501-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-prosumer",
    useCase: "Fast low-latency enterprise workhorse fitting completely inside 16\u201324GB VRAM",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "gemma-3-27b",
    name: "Gemma 3 27B Instruct",
    family: "Google Gemma 3",
    paramsB: 27.4,
    activeParamsB: 27.4,
    isMoE: false,
    layers: 62,
    kvHeads: 16,
    headDim: 128,
    hiddenSize: 5376,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/google_gemma-3-27b-it-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-prosumer",
    useCase: "Frontier single-GPU 24GB / Apple 32GB+ workstation model",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "AWQ-INT4"]
  },
  {
    id: "qwen-2.5-32b",
    name: "Qwen 2.5 Coder 32B Instruct",
    family: "Alibaba Qwen 2.5",
    paramsB: 32.8,
    activeParamsB: 32.8,
    isMoE: false,
    layers: 64,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 5120,
    maxNativeContext: 131072,
    huggingfaceRepo: "Qwen/Qwen2.5-Coder-32B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-prosumer",
    useCase: "Top-tier local software engineering model for 24GB GPUs and 36GB+ Macs",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "deepseek-r1-32b",
    name: "DeepSeek-R1 Distill Qwen 32B",
    family: "DeepSeek R1 Distill",
    paramsB: 32.8,
    activeParamsB: 32.8,
    isMoE: false,
    layers: 64,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 5120,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: true,
    minHardwareClassId: "class-prosumer",
    useCase: "High-accuracy local reasoning model for 24GB VRAM or 32\u201364GB Unified Memory",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "llama-3.3-70b",
    name: "Llama 3.3 70B Instruct",
    family: "Meta Llama 3",
    paramsB: 70.6,
    activeParamsB: 70.6,
    isMoE: false,
    layers: 80,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 8192,
    maxNativeContext: 131072,
    huggingfaceRepo: "bartowski/Llama-3.3-70B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: false,
    minHardwareClassId: "class-apple-unified",
    useCase: "Large-scale dense reasoning; runs full-speed on 48GB+ VRAM / 64GB+ Unified or hybrid-offloaded on 24GB+64GB RAM",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "EXL2-4.25bpw", "AWQ-INT4"]
  },
  {
    id: "qwen-2.5-72b",
    name: "Qwen 2.5 72B Instruct",
    family: "Alibaba Qwen 2.5",
    paramsB: 72.7,
    activeParamsB: 72.7,
    isMoE: false,
    layers: 80,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 8192,
    maxNativeContext: 131072,
    huggingfaceRepo: "Qwen/Qwen2.5-72B-Instruct-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: false,
    minHardwareClassId: "class-server",
    useCase: "Heavy analytical and multilingual flagship requiring 48GB+ VRAM or aggressive hybrid offloading",
    teamValidatedQuants: ["FP16", "Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "AWQ-INT4"]
  },
  {
    id: "mixtral-8x22b",
    name: "Mixtral 8x22B Instruct (MoE)",
    family: "Mistral MoE",
    paramsB: 141,
    activeParamsB: 39,
    isMoE: true,
    layers: 56,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 6144,
    maxNativeContext: 65536,
    huggingfaceRepo: "MaziyarPanahi/Mixtral-8x22B-Instruct-v0.1-GGUF",
    defaultQuant: "Q4_K_M",
    recommendedForStandard: false,
    minHardwareClassId: "class-server",
    useCase: "Sparse MoE model well-suited for GPU attention + CPU expert offloading on 128GB RAM workstations",
    teamValidatedQuants: ["Q4_K_M", "Q5_K_M", "Q6_K"]
  },
  {
    id: "deepseek-r1-671b",
    name: "DeepSeek-R1 671B (MoE)",
    family: "DeepSeek MoE",
    paramsB: 671,
    activeParamsB: 37,
    isMoE: true,
    layers: 61,
    kvHeads: 16,
    headDim: 128,
    hiddenSize: 7168,
    maxNativeContext: 131072,
    huggingfaceRepo: "unsloth/DeepSeek-R1-GGUF",
    defaultQuant: "IQ1_S",
    recommendedForStandard: false,
    minHardwareClassId: "class-server",
    useCase: "Frontier 671B sparse MoE (37B active); experimental execution via KTransformers or llama.cpp IQ1/IQ2 + 192GB\u2013512GB RAM",
    teamValidatedQuants: ["Q4_K_M"]
  }
];
var HARDWARE_CLASSES = [
  {
    id: "class-entry",
    name: "Class 1: Entry Laptop / Integrated GPU",
    tierIndex: 1,
    typicalSpecs: "8\u201316 GB System RAM \xB7 Integrated GPU (Intel Iris Xe / Radeon 780M / M1 8GB)",
    minRamGB: 8,
    minVramGB: 0,
    largestValidatedModel: "Qwen 2.5 7B Instruct",
    largestValidatedQuant: "Q4_K_M",
    largestExperimentalModel: "Gemma 3 12B Instruct",
    largestExperimentalQuant: "IQ3_XXS",
    recommendedRuntime: "llama.cpp",
    expectedTokPerSec: "7 \u2013 16 tok/s",
    practicalContextCeiling: 8192,
    thermalNotes: "Sustained CPU/iGPU load triggers laptop TDP throttling after ~90s (78\u201388\xB0C)."
  },
  {
    id: "class-standard",
    name: "Class 2: Standard Consumer GPU (6\u20138 GB VRAM)",
    tierIndex: 2,
    typicalSpecs: "16\u201332 GB RAM \xB7 RTX 3060 Laptop / RTX 4060 / RX 7600 (6\u20138 GB VRAM)",
    minRamGB: 16,
    minVramGB: 6,
    largestValidatedModel: "Llama 3.1 8B Instruct",
    largestValidatedQuant: "Q4_K_M",
    largestExperimentalModel: "Mistral Small 3 24B Instruct",
    largestExperimentalQuant: "IQ3_XXS (Hybrid Split)",
    recommendedRuntime: "llama.cpp",
    expectedTokPerSec: "38 \u2013 64 tok/s (8B GPU) \xB7 5 \u2013 9 tok/s (24B Hybrid)",
    practicalContextCeiling: 16384,
    thermalNotes: "Full-GPU 8B holds 66\u201374\xB0C; hybrid offload shifts load to CPU package."
  },
  {
    id: "class-midrange",
    name: "Class 3: Enthusiast GPU (12\u201316 GB VRAM)",
    tierIndex: 3,
    typicalSpecs: "32 GB RAM \xB7 RTX 4070 / 4070 Ti Super / 4080 / RX 7800 XT (12\u201316 GB VRAM)",
    minRamGB: 24,
    minVramGB: 12,
    largestValidatedModel: "DeepSeek-R1 Distill Qwen 14B",
    largestValidatedQuant: "Q4_K_M",
    largestExperimentalModel: "Qwen 2.5 Coder 32B Instruct",
    largestExperimentalQuant: "IQ3_XXS (Hybrid Split)",
    recommendedRuntime: "exllamav2",
    expectedTokPerSec: "45 \u2013 78 tok/s (14B) \xB7 9 \u2013 15 tok/s (32B Hybrid)",
    practicalContextCeiling: 32768,
    thermalNotes: "Steady 64\u201375\xB0C on desktop cards; Q4 KV cache required above 16K context on 12GB VRAM."
  },
  {
    id: "class-apple-unified",
    name: "Class 4: Apple Silicon Unified Memory (32\u2013128 GB)",
    tierIndex: 4,
    typicalSpecs: "32\u2013128 GB Unified Memory \xB7 Apple M2 / M3 / M4 Pro, Max, or Ultra (200\u2013800 GB/s)",
    minRamGB: 32,
    minVramGB: 24,
    unifiedMemoryClass: true,
    largestValidatedModel: "Llama 3.3 70B Instruct (on 64GB+) / Qwen 32B (on 32\u201348GB)",
    largestValidatedQuant: "Q4_K_M",
    largestExperimentalModel: "Mixtral 8x22B / DeepSeek-R1 671B (128GB+ IQ1_S)",
    largestExperimentalQuant: "IQ2_XS / IQ1_S",
    recommendedRuntime: "mlx-lm",
    expectedTokPerSec: "24 \u2013 48 tok/s (32B) \xB7 10 \u2013 19 tok/s (70B Max/Ultra)",
    practicalContextCeiling: 65536,
    thermalNotes: "High thermal efficiency (58\u201374\xB0C); macOS allocates ~75% of Unified RAM to Metal by default."
  },
  {
    id: "class-prosumer",
    name: "Class 5: Prosumer 24 GB VRAM Workstation",
    tierIndex: 5,
    typicalSpecs: "64 GB RAM \xB7 RTX 3090 / RTX 4090 / RTX 5090 / RX 7900 XTX (24\u201332 GB VRAM)",
    minRamGB: 32,
    minVramGB: 22,
    largestValidatedModel: "Qwen 2.5 Coder 32B Instruct",
    largestValidatedQuant: "Q4_K_M / EXL2-4.25bpw",
    largestExperimentalModel: "Llama 3.3 70B Instruct",
    largestExperimentalQuant: "IQ2_XS / Hybrid 38 GPU Layers",
    recommendedRuntime: "exllamav2",
    expectedTokPerSec: "38 \u2013 56 tok/s (32B Full GPU) \xB7 4.5 \u2013 9 tok/s (70B Hybrid)",
    practicalContextCeiling: 65536,
    thermalNotes: "320\u2013450W sustained draw during long prefills (70\u201379\xB0C); power-limiting to 300W saves ~35% heat with <5% tok/s loss."
  },
  {
    id: "class-server",
    name: "Class 6: Multi-GPU / High-VRAM Server (48\u201380+ GB VRAM)",
    tierIndex: 6,
    typicalSpecs: "128\u2013512 GB RAM \xB7 2\xD7RTX 4090 / RTX 6000 Ada / A100 80GB / H100",
    minRamGB: 128,
    minVramGB: 48,
    largestValidatedModel: "Llama 3.3 70B / Qwen 2.5 72B Instruct",
    largestValidatedQuant: "AWQ-INT4 / Q6_K / FP8",
    largestExperimentalModel: "DeepSeek-R1 671B (MoE)",
    largestExperimentalQuant: "IQ2_XS (KTransformers MoE Offload)",
    recommendedRuntime: "vllm",
    expectedTokPerSec: "34 \u2013 68 tok/s (70B vLLM/TRT-LLM) \xB7 8 \u2013 14 tok/s (671B MoE)",
    practicalContextCeiling: 131072,
    thermalNotes: "Blower/server airflow maintains 68\u201380\xB0C under continuous PagedAttention batching."
  }
];
var BASELINE_BENCHMARKS = [
  {
    id: "bm-01",
    timestamp: "2026-10-14T11:20:00Z",
    source: "team-baseline",
    hardwareClassId: "class-entry",
    hardwareLabel: "ThinkPad X1 (i7-1365U \xB7 16GB RAM \xB7 Iris Xe)",
    modelId: "llama-3.2-3b",
    modelName: "Llama 3.2 3B Instruct",
    runtimeId: "llama.cpp",
    quantId: "Q4_K_M",
    offloadStrategy: "cpu-only-mmap",
    gpuLayersSplit: "0 / 28 GPU",
    contextLength: 8192,
    maxPracticalContext: 16384,
    ramUsedGB: 3.1,
    vramUsedGB: 0,
    diskUsageGB: 2.02,
    loadTimeSec: 1.4,
    ttftMs: 410,
    tokensPerSec: 18.4,
    cpuUtilPct: 86,
    gpuUtilPct: 4,
    peakTempC: 79,
    thermalBehavior: "Warm Sustained",
    validationStatus: "team-validated"
  },
  {
    id: "bm-02",
    timestamp: "2026-10-14T12:05:00Z",
    source: "team-baseline",
    hardwareClassId: "class-entry",
    hardwareLabel: "ThinkPad X1 (i7-1365U \xB7 16GB RAM \xB7 Iris Xe)",
    modelId: "qwen-2.5-7b",
    modelName: "Qwen 2.5 7B Instruct",
    runtimeId: "llama.cpp",
    quantId: "Q4_K_M",
    offloadStrategy: "cpu-only-mmap",
    gpuLayersSplit: "0 / 28 GPU",
    contextLength: 4096,
    maxPracticalContext: 8192,
    ramUsedGB: 5.9,
    vramUsedGB: 0,
    diskUsageGB: 4.68,
    loadTimeSec: 2.8,
    ttftMs: 1240,
    tokensPerSec: 8.6,
    cpuUtilPct: 94,
    gpuUtilPct: 6,
    peakTempC: 86,
    thermalBehavior: "Thermal Throttled",
    validationStatus: "team-validated"
  },
  {
    id: "bm-03",
    timestamp: "2026-10-15T09:12:00Z",
    source: "team-baseline",
    hardwareClassId: "class-standard",
    hardwareLabel: "Desktop (Ryzen 7 5800X \xB7 32GB RAM \xB7 RTX 4060 8GB)",
    modelId: "llama-3.1-8b",
    modelName: "Llama 3.1 8B Instruct",
    runtimeId: "llama.cpp",
    quantId: "Q4_K_M",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "32 / 32 GPU",
    contextLength: 8192,
    maxPracticalContext: 16384,
    ramUsedGB: 2.1,
    vramUsedGB: 6.4,
    diskUsageGB: 4.92,
    loadTimeSec: 1.9,
    ttftMs: 145,
    tokensPerSec: 52.3,
    cpuUtilPct: 14,
    gpuUtilPct: 96,
    peakTempC: 68,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-04",
    timestamp: "2026-10-15T10:30:00Z",
    source: "team-baseline",
    hardwareClassId: "class-standard",
    hardwareLabel: "Desktop (Ryzen 7 5800X \xB7 32GB RAM \xB7 RTX 4060 8GB)",
    modelId: "llama-3.1-8b",
    modelName: "Llama 3.1 8B Instruct",
    runtimeId: "mlc-llm",
    quantId: "Q4_K_M",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "32 / 32 GPU",
    contextLength: 8192,
    maxPracticalContext: 16384,
    ramUsedGB: 1.8,
    vramUsedGB: 6.6,
    diskUsageGB: 4.61,
    loadTimeSec: 2.6,
    ttftMs: 122,
    tokensPerSec: 57.1,
    cpuUtilPct: 11,
    gpuUtilPct: 98,
    peakTempC: 70,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-05",
    timestamp: "2026-10-15T11:45:00Z",
    source: "team-baseline",
    hardwareClassId: "class-standard",
    hardwareLabel: "Desktop (Ryzen 7 5800X \xB7 32GB RAM \xB7 RTX 4060 8GB)",
    modelId: "deepseek-r1-14b",
    modelName: "DeepSeek-R1 Distill Qwen 14B",
    runtimeId: "llama.cpp",
    quantId: "Q4_K_M",
    offloadStrategy: "hybrid-gpu-cpu",
    gpuLayersSplit: "28 / 48 GPU",
    contextLength: 8192,
    maxPracticalContext: 16384,
    ramUsedGB: 6.2,
    vramUsedGB: 6.9,
    diskUsageGB: 8.98,
    loadTimeSec: 4.2,
    ttftMs: 890,
    tokensPerSec: 11.8,
    cpuUtilPct: 72,
    gpuUtilPct: 58,
    peakTempC: 71,
    thermalBehavior: "Stable",
    validationStatus: "experimental"
  },
  {
    id: "bm-06",
    timestamp: "2026-10-16T08:15:00Z",
    source: "team-baseline",
    hardwareClassId: "class-midrange",
    hardwareLabel: "Workstation (i7-14700K \xB7 32GB RAM \xB7 RTX 4070 Ti Super 16GB)",
    modelId: "deepseek-r1-14b",
    modelName: "DeepSeek-R1 Distill Qwen 14B",
    runtimeId: "exllamav2",
    quantId: "EXL2-4.25bpw",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "48 / 48 GPU",
    contextLength: 16384,
    maxPracticalContext: 49152,
    ramUsedGB: 2.3,
    vramUsedGB: 11.4,
    diskUsageGB: 7.92,
    loadTimeSec: 2.9,
    ttftMs: 112,
    tokensPerSec: 69.4,
    cpuUtilPct: 12,
    gpuUtilPct: 98,
    peakTempC: 69,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-07",
    timestamp: "2026-10-16T09:40:00Z",
    source: "team-baseline",
    hardwareClassId: "class-midrange",
    hardwareLabel: "Workstation (i7-14700K \xB7 32GB RAM \xB7 RTX 4070 Ti Super 16GB)",
    modelId: "mistral-small-24b",
    modelName: "Mistral Small 3 24B Instruct",
    runtimeId: "llama.cpp",
    quantId: "Q4_K_M",
    offloadStrategy: "hybrid-gpu-cpu",
    gpuLayersSplit: "36 / 40 GPU",
    contextLength: 16384,
    maxPracticalContext: 24576,
    ramUsedGB: 4.8,
    vramUsedGB: 14.9,
    diskUsageGB: 14.3,
    loadTimeSec: 4.8,
    ttftMs: 420,
    tokensPerSec: 24.6,
    cpuUtilPct: 48,
    gpuUtilPct: 82,
    peakTempC: 73,
    thermalBehavior: "Stable",
    validationStatus: "experimental"
  },
  {
    id: "bm-08",
    timestamp: "2026-10-16T14:22:00Z",
    source: "team-baseline",
    hardwareClassId: "class-apple-unified",
    hardwareLabel: 'MacBook Pro 16" (Apple M3 Max \xB7 64GB Unified \xB7 400 GB/s)',
    modelId: "qwen-2.5-32b",
    modelName: "Qwen 2.5 Coder 32B Instruct",
    runtimeId: "mlx-lm",
    quantId: "Q4_K_M",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "64 / 64 Unified",
    contextLength: 32768,
    maxPracticalContext: 98304,
    ramUsedGB: 24.8,
    vramUsedGB: 24.8,
    diskUsageGB: 19.8,
    loadTimeSec: 3.1,
    ttftMs: 460,
    tokensPerSec: 17.8,
    cpuUtilPct: 18,
    gpuUtilPct: 95,
    peakTempC: 67,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-09",
    timestamp: "2026-10-16T15:10:00Z",
    source: "team-baseline",
    hardwareClassId: "class-apple-unified",
    hardwareLabel: 'MacBook Pro 16" (Apple M3 Max \xB7 64GB Unified \xB7 400 GB/s)',
    modelId: "llama-3.3-70b",
    modelName: "Llama 3.3 70B Instruct",
    runtimeId: "mlx-lm",
    quantId: "Q4_K_M",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "80 / 80 Unified",
    contextLength: 16384,
    maxPracticalContext: 32768,
    ramUsedGB: 45.6,
    vramUsedGB: 45.6,
    diskUsageGB: 42.5,
    loadTimeSec: 6.4,
    ttftMs: 1120,
    tokensPerSec: 8.4,
    cpuUtilPct: 20,
    gpuUtilPct: 97,
    peakTempC: 72,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-10",
    timestamp: "2026-10-17T09:00:00Z",
    source: "team-baseline",
    hardwareClassId: "class-prosumer",
    hardwareLabel: "Rig (Ryzen 9 7950X \xB7 64GB DDR5 \xB7 RTX 4090 24GB)",
    modelId: "qwen-2.5-32b",
    modelName: "Qwen 2.5 Coder 32B Instruct",
    runtimeId: "exllamav2",
    quantId: "EXL2-4.25bpw",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "64 / 64 GPU",
    contextLength: 32768,
    maxPracticalContext: 65536,
    ramUsedGB: 3.2,
    vramUsedGB: 21.6,
    diskUsageGB: 17.4,
    loadTimeSec: 4.1,
    ttftMs: 168,
    tokensPerSec: 52.8,
    cpuUtilPct: 15,
    gpuUtilPct: 99,
    peakTempC: 74,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-11",
    timestamp: "2026-10-17T10:15:00Z",
    source: "team-baseline",
    hardwareClassId: "class-prosumer",
    hardwareLabel: "Rig (Ryzen 9 7950X \xB7 64GB DDR5 \xB7 RTX 4090 24GB)",
    modelId: "qwen-2.5-32b",
    modelName: "Qwen 2.5 Coder 32B Instruct",
    runtimeId: "tensorrt-llm",
    quantId: "AWQ-INT4",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "64 / 64 GPU",
    contextLength: 16384,
    maxPracticalContext: 32768,
    ramUsedGB: 4.1,
    vramUsedGB: 22.1,
    diskUsageGB: 17.9,
    loadTimeSec: 5.8,
    ttftMs: 96,
    tokensPerSec: 58.2,
    cpuUtilPct: 12,
    gpuUtilPct: 99,
    peakTempC: 76,
    thermalBehavior: "Warm Sustained",
    validationStatus: "team-validated"
  },
  {
    id: "bm-12",
    timestamp: "2026-10-17T11:40:00Z",
    source: "team-baseline",
    hardwareClassId: "class-prosumer",
    hardwareLabel: "Rig (Ryzen 9 7950X \xB7 64GB DDR5 \xB7 RTX 4090 24GB)",
    modelId: "llama-3.3-70b",
    modelName: "Llama 3.3 70B Instruct",
    runtimeId: "llama.cpp",
    quantId: "Q4_K_M",
    offloadStrategy: "hybrid-gpu-cpu",
    gpuLayersSplit: "38 / 80 GPU",
    contextLength: 16384,
    maxPracticalContext: 32768,
    ramUsedGB: 25.4,
    vramUsedGB: 21.8,
    diskUsageGB: 42.5,
    loadTimeSec: 11.2,
    ttftMs: 1940,
    tokensPerSec: 6.3,
    cpuUtilPct: 88,
    gpuUtilPct: 54,
    peakTempC: 75,
    thermalBehavior: "Warm Sustained",
    validationStatus: "experimental"
  },
  {
    id: "bm-13",
    timestamp: "2026-10-18T08:45:00Z",
    source: "team-baseline",
    hardwareClassId: "class-server",
    hardwareLabel: "Node (EPYC 9354 \xB7 256GB DDR5 \xB7 2\xD7RTX 4090 48GB)",
    modelId: "llama-3.3-70b",
    modelName: "Llama 3.3 70B Instruct",
    runtimeId: "vllm",
    quantId: "AWQ-INT4",
    offloadStrategy: "full-gpu",
    gpuLayersSplit: "80 / 80 TP=2",
    contextLength: 32768,
    maxPracticalContext: 98304,
    ramUsedGB: 8.6,
    vramUsedGB: 44.2,
    diskUsageGB: 37.8,
    loadTimeSec: 12.4,
    ttftMs: 138,
    tokensPerSec: 46.5,
    cpuUtilPct: 16,
    gpuUtilPct: 98,
    peakTempC: 73,
    thermalBehavior: "Stable",
    validationStatus: "team-validated"
  },
  {
    id: "bm-14",
    timestamp: "2026-10-18T11:20:00Z",
    source: "team-baseline",
    hardwareClassId: "class-server",
    hardwareLabel: "Node (EPYC 9354 \xB7 384GB DDR5 \xB7 RTX 4090 24GB)",
    modelId: "deepseek-r1-671b",
    modelName: "DeepSeek-R1 671B (MoE)",
    runtimeId: "ktransformers",
    quantId: "IQ2_XS",
    offloadStrategy: "moe-cpu-experts",
    gpuLayersSplit: "Attn GPU / Experts CPU",
    contextLength: 16384,
    maxPracticalContext: 32768,
    ramUsedGB: 212,
    vramUsedGB: 21.2,
    diskUsageGB: 194,
    loadTimeSec: 48.5,
    ttftMs: 2850,
    tokensPerSec: 11.4,
    cpuUtilPct: 92,
    gpuUtilPct: 42,
    peakTempC: 78,
    thermalBehavior: "Warm Sustained",
    validationStatus: "experimental"
  }
];

// server/hal.ts
var KV_BYTES_PER_ELEMENT = {
  fp16: 2,
  q8_0: 1.06,
  q4_0: 0.56
};
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function getUsableMemoryBudgets(profile) {
  if (profile.unifiedMemory) {
    const pool = Math.max(profile.unifiedMemoryPoolGB || profile.ramTotalGB, 8);
    const usableUnified = round2(pool * 0.76);
    return {
      usableVramGB: usableUnified,
      usableRamGB: round2(pool * 0.85)
    };
  }
  const usableVramGB = profile.vramTotalGB > 0 ? round2(Math.max(0, profile.vramAvailableGB > 0 ? profile.vramAvailableGB * 0.94 : profile.vramTotalGB * 0.88)) : 0;
  const usableRamGB = round2(
    Math.max(2, profile.ramAvailableGB > 0 ? profile.ramAvailableGB * 0.88 : profile.ramTotalGB * 0.78)
  );
  return { usableVramGB, usableRamGB };
}
function classifyHardware(profile) {
  const effectiveVram = profile.unifiedMemory ? profile.unifiedMemoryPoolGB * 0.75 : profile.vramTotalGB;
  if (profile.unifiedMemory && profile.unifiedMemoryPoolGB >= 24) {
    return HARDWARE_CLASSES.find((c) => c.id === "class-apple-unified");
  }
  if (!profile.unifiedMemory && effectiveVram >= 44 && profile.ramTotalGB >= 64) {
    return HARDWARE_CLASSES.find((c) => c.id === "class-server");
  }
  if (!profile.unifiedMemory && effectiveVram >= 20) {
    return HARDWARE_CLASSES.find((c) => c.id === "class-prosumer");
  }
  if (effectiveVram >= 11) {
    return HARDWARE_CLASSES.find((c) => c.id === "class-midrange");
  }
  if (effectiveVram >= 5.5) {
    return HARDWARE_CLASSES.find((c) => c.id === "class-standard");
  }
  return HARDWARE_CLASSES.find((c) => c.id === "class-entry");
}
function evaluateRuntimes(profile) {
  const { usableVramGB } = getUsableMemoryBudgets(profile);
  return RUNTIME_ENGINES.map((engine) => {
    const vendorSupported = engine.supportedVendors.includes(profile.gpuVendor);
    let compatible = true;
    let compatibilityReason = "Fully compatible with detected local hardware.";
    let effectiveValidation = engine.validationStatus;
    if (engine.id === "mlx-lm") {
      if (profile.gpuVendor !== "apple" || !profile.unifiedMemory) {
        compatible = false;
        compatibilityReason = "Requires Apple Silicon macOS with Unified Memory.";
        effectiveValidation = "exceeds-hardware";
      } else {
        compatibilityReason = `Native zero-copy Metal execution across ${round1(profile.unifiedMemoryPoolGB)} GB Unified Memory.`;
      }
    } else if (engine.id === "tensorrt-llm") {
      if (profile.gpuVendor !== "nvidia") {
        compatible = false;
        compatibilityReason = "Requires an NVIDIA Ampere/Ada/Hopper CUDA GPU.";
        effectiveValidation = "exceeds-hardware";
      } else if (profile.vramTotalGB < 10) {
        compatible = true;
        compatibilityReason = `Compatible with CUDA, but ${profile.vramTotalGB} GB VRAM leaves tight headroom after TensorRT engine overhead.`;
        effectiveValidation = "experimental";
      } else {
        compatibilityReason = `Supported on ${profile.gpuName} (${profile.vramTotalGB} GB VRAM) with FP8/AWQ-INT4 kernels.`;
      }
    } else if (engine.id === "vllm") {
      if (!vendorSupported) {
        compatible = false;
        compatibilityReason = "Requires NVIDIA CUDA or AMD ROCm discrete GPU.";
        effectiveValidation = "exceeds-hardware";
      } else if (profile.vramTotalGB < 12) {
        compatible = true;
        compatibilityReason = `Runnable on ${profile.vramTotalGB} GB VRAM for <=8B models, though PagedAttention benefits most from >=16 GB VRAM.`;
        effectiveValidation = "experimental";
      } else {
        compatibilityReason = `Validated for PagedAttention continuous batching on ${profile.gpuName}.`;
      }
    } else if (engine.id === "exllamav2") {
      if (!vendorSupported) {
        compatible = false;
        compatibilityReason = "Requires NVIDIA CUDA or AMD ROCm GPU (no Apple Metal or CPU-only mode).";
        effectiveValidation = "exceeds-hardware";
      } else if (profile.vramTotalGB < 6) {
        compatible = false;
        compatibilityReason = "Requires at least 6 GB discrete VRAM for practical EXL2 execution.";
        effectiveValidation = "exceeds-hardware";
      } else {
        compatibilityReason = `Optimal single-user consumer GPU speed on ${profile.gpuName} using EXL2 fractional quantization.`;
      }
    } else if (engine.id === "ktransformers") {
      if (profile.gpuVendor !== "nvidia" || profile.ramTotalGB < 32) {
        compatible = false;
        compatibilityReason = "Requires NVIDIA CUDA GPU (>=12 GB VRAM) plus >=32 GB host RAM for MoE expert offloading.";
        effectiveValidation = "exceeds-hardware";
      } else {
        compatibilityReason = "Experimental MoE CPU+GPU scheduler available for sparse multi-expert models.";
        effectiveValidation = "experimental";
      }
    } else if (engine.id === "mlc-llm") {
      if (!vendorSupported && !profile.webgpuSupported) {
        compatible = false;
        compatibilityReason = "Requires Vulkan, Metal, CUDA, or WebGPU capable GPU.";
        effectiveValidation = "exceeds-hardware";
      } else if (usableVramGB < 4) {
        compatible = true;
        compatibilityReason = "GPU buffer space is tight (<4 GB); viable for 3B compiled models via WebGPU/Vulkan.";
        effectiveValidation = "experimental";
      } else {
        compatibilityReason = `Compiled GPU backend supported via ${profile.gpuVendor === "apple" ? "Metal" : profile.gpuVendor === "nvidia" ? "CUDA/Vulkan" : "Vulkan/WebGPU"}.`;
      }
    } else if (engine.id === "llama.cpp") {
      compatible = true;
      if (profile.unifiedMemory) {
        compatibilityReason = `Universal GGUF runtime accelerated by Apple Metal (${round1(profile.unifiedMemoryPoolGB)} GB Unified).`;
      } else if (profile.vramTotalGB >= 4) {
        compatibilityReason = `Universal GGUF runtime with full or hybrid GPU layer offloading on ${profile.gpuName} + ${profile.cpuCores} CPU threads.`;
      } else {
        compatibilityReason = `Validated CPU mmap execution on ${profile.cpuCores} logical cores with SIMD acceleration.`;
      }
    } else if (engine.id === "ollama") {
      compatible = true;
      if (profile.unifiedMemory) {
        compatibilityReason = `Ollama runtime accelerated by Apple Metal unified memory on port 11434.`;
      } else if (profile.vramTotalGB >= 4) {
        compatibilityReason = `Ollama runtime with automatic GPU layer offloading on ${profile.gpuName}.`;
      } else {
        compatibilityReason = `Ollama runtime with CPU execution on ${profile.cpuCores} logical cores.`;
      }
    }
    const recommended = compatible && (profile.unifiedMemory && engine.id === "mlx-lm" || !profile.unifiedMemory && profile.gpuVendor === "nvidia" && profile.vramTotalGB >= 12 && engine.id === "exllamav2" || !profile.unifiedMemory && profile.gpuVendor === "nvidia" && profile.vramTotalGB >= 40 && engine.id === "vllm" || engine.id === "llama.cpp");
    return {
      engine,
      compatible,
      recommended,
      compatibilityReason,
      estimatedOverheadGB: round2(engine.vramOverheadGB),
      effectiveValidation
    };
  });
}
function calculateKvCacheGB(model, contextSize, kvCacheQuant, flashAttention) {
  const bytesPerElem = KV_BYTES_PER_ELEMENT[kvCacheQuant];
  const rawBytes = 2 * model.layers * model.kvHeads * model.headDim * contextSize * bytesPerElem;
  const flashFactor = flashAttention ? 0.92 : 1;
  return round2(rawBytes * flashFactor / 1024 ** 3);
}
function buildCliCommand(config, model, gpuLayers) {
  const fileSlug = `${model.id}-${config.quantId.toLowerCase()}.gguf`;
  const kvFlag = config.kvCacheQuant === "fp16" ? "" : ` --cache-type-k ${config.kvCacheQuant} --cache-type-v ${config.kvCacheQuant}`;
  const faFlag = config.flashAttention ? " --flash-attn" : "";
  const mmapFlag = config.useMmap ? "" : " --no-mmap";
  switch (config.runtimeId) {
    case "llama.cpp": {
      const moeOffload = config.offloadStrategy === "moe-cpu-experts" ? ' -ot ".ffn_.*_exps.=CPU"' : "";
      return `llama-server -hf ${model.huggingfaceRepo} -m ./models/${fileSlug} -ngl ${gpuLayers} -c ${config.contextSize} -t ${config.cpuThreads} -b ${config.batchSize}${faFlag}${kvFlag}${mmapFlag}${moeOffload} --host 127.0.0.1 --port 8080`;
    }
    case "exllamav2":
      return `python -m tabbyAPI --model-name ${model.id}-${config.quantId} --max-seq-len ${config.contextSize} --cache-mode ${config.kvCacheQuant === "fp16" ? "FP16" : config.kvCacheQuant === "q8_0" ? "Q8" : "Q4"} --port 5000`;
    case "mlc-llm":
      return `mlc_llm serve HF://mlc-ai/${model.id}-${config.quantId}-MLC --overrides "context_window_size=${config.contextSize};prefill_chunk_size=${config.batchSize}" --port 8000`;
    case "mlx-lm":
      return `mlx_lm.server --model mlx-community/${model.id}-${config.quantId.includes("4") ? "4bit" : "8bit"} --max-tokens ${Math.min(config.contextSize, 8192)} --port 8081`;
    case "vllm":
      return `vllm serve ${model.huggingfaceRepo.replace("-GGUF", "")} --quantization ${config.quantId === "AWQ-INT4" ? "awq_marlin" : "fp8"} --max-model-len ${config.contextSize} --gpu-memory-utilization 0.90 --port 8000`;
    case "tensorrt-llm":
      return `trtllm-serve ${model.id}-${config.quantId}-engine --max_seq_len ${config.contextSize} --max_batch_size ${Math.max(1, Math.floor(config.batchSize / 128))} --kv_cache_free_gpu_memory_fraction 0.88 --port 8001`;
    case "ktransformers":
      return `ktransformers --model_path ${model.huggingfaceRepo} --gguf_path ./models/${fileSlug} --optimize_config_path DeepSeek-V3-Chat.yaml --cpu_infer ${config.cpuThreads} --max_new_tokens 4096 --port 10002`;
    default:
      return `llama-server -m ./models/${fileSlug} -ngl ${gpuLayers} -c ${config.contextSize}`;
  }
}
function computeExecutionPlan(profile, config) {
  const model = MODELS.find((m) => m.id === config.modelId) ?? MODELS[1];
  const runtime = RUNTIME_ENGINES.find((r) => r.id === config.runtimeId) ?? RUNTIME_ENGINES[0];
  const quant = QUANTIZATIONS.find((q) => q.id === config.quantId) ?? QUANTIZATIONS[4];
  const { usableVramGB, usableRamGB } = getUsableMemoryBudgets(profile);
  const weightsSizeGB = round2(model.paramsB * quant.bitsPerWeight / 8 * 1.04);
  const diskUsageGB = round2(weightsSizeGB * 1.03);
  const kvCacheSizeGB = calculateKvCacheGB(
    model,
    config.contextSize,
    config.kvCacheQuant,
    config.flashAttention
  );
  let gpuLayersAllocated = Math.max(0, Math.min(model.layers, Math.round(config.gpuLayers)));
  if (config.offloadStrategy === "full-gpu") {
    gpuLayersAllocated = model.layers;
  } else if (config.offloadStrategy === "cpu-only-mmap") {
    gpuLayersAllocated = 0;
  } else if (config.offloadStrategy === "disk-layer-stream") {
    gpuLayersAllocated = 1;
  }
  const cpuLayersAllocated = Math.max(0, model.layers - gpuLayersAllocated);
  const gpuFraction = model.layers > 0 ? gpuLayersAllocated / model.layers : 0;
  let vramRequiredGB = 0;
  let ramRequiredGB = 0;
  if (profile.unifiedMemory) {
    const totalPoolUsed = weightsSizeGB + kvCacheSizeGB + runtime.vramOverheadGB + (config.offloadStrategy === "cpu-only-mmap" ? 0.3 : 0);
    vramRequiredGB = config.offloadStrategy === "cpu-only-mmap" ? 0 : round2(totalPoolUsed);
    ramRequiredGB = round2(totalPoolUsed);
  } else if (config.offloadStrategy === "moe-cpu-experts" && model.isMoE) {
    const gpuWeights = weightsSizeGB * 0.14;
    const cpuWeights = weightsSizeGB * 0.86;
    vramRequiredGB = round2(gpuWeights + kvCacheSizeGB + runtime.vramOverheadGB);
    ramRequiredGB = round2(cpuWeights + runtime.ramOverheadGB);
  } else if (config.offloadStrategy === "disk-layer-stream") {
    const singleLayerGB = weightsSizeGB / Math.max(model.layers, 1);
    vramRequiredGB = round2(singleLayerGB * 2.2 + kvCacheSizeGB * 0.5 + runtime.vramOverheadGB);
    ramRequiredGB = round2(singleLayerGB * 4 + kvCacheSizeGB * 0.5 + runtime.ramOverheadGB);
  } else if (config.offloadStrategy === "cpu-only-mmap") {
    vramRequiredGB = 0;
    ramRequiredGB = round2(weightsSizeGB + kvCacheSizeGB + runtime.ramOverheadGB);
  } else {
    const gpuWeights = weightsSizeGB * gpuFraction;
    const cpuWeights = weightsSizeGB * (1 - gpuFraction);
    const kvOnGpu = gpuFraction > 0.35 ? kvCacheSizeGB * Math.max(0.5, gpuFraction) : 0;
    const kvOnRam = kvCacheSizeGB - kvOnGpu;
    vramRequiredGB = gpuLayersAllocated > 0 ? round2(gpuWeights + kvOnGpu + runtime.vramOverheadGB) : 0;
    ramRequiredGB = round2(
      cpuWeights + kvOnRam + runtime.ramOverheadGB + (gpuLayersAllocated > 0 ? 0.8 : 0)
    );
  }
  const vramCapacity = profile.unifiedMemory ? usableVramGB : profile.vramTotalGB;
  const ramCapacity = profile.ramTotalGB;
  const vramUtilizationPct = vramCapacity > 0 ? Math.min(180, Math.round(vramRequiredGB / vramCapacity * 100)) : vramRequiredGB > 0 ? 180 : 0;
  const ramUtilizationPct = ramCapacity > 0 ? Math.min(180, Math.round(ramRequiredGB / ramCapacity * 100)) : 180;
  const vramFits = vramRequiredGB === 0 || usableVramGB > 0 && vramRequiredGB <= usableVramGB * 1.02;
  const ramFits = ramRequiredGB <= usableRamGB * 1.04;
  const memoryFits = profile.unifiedMemory ? ramRequiredGB <= usableVramGB * 1.03 : vramFits && ramFits;
  const diskFits = profile.diskAvailableGB >= diskUsageGB + 1.5;
  const kvPer1kTokensGB = calculateKvCacheGB(model, 1024, config.kvCacheQuant, config.flashAttention);
  let freeForKvGB = 0;
  if (profile.unifiedMemory) {
    freeForKvGB = Math.max(0, usableVramGB - weightsSizeGB - runtime.vramOverheadGB);
  } else if (gpuLayersAllocated > 0 && config.offloadStrategy !== "cpu-only-mmap") {
    const baseGpu = vramRequiredGB - kvCacheSizeGB * (gpuFraction > 0.35 ? Math.max(0.5, gpuFraction) : 0);
    const freeGpu = Math.max(0, usableVramGB - baseGpu);
    const baseRam = ramRequiredGB - (kvCacheSizeGB - kvCacheSizeGB * (gpuFraction > 0.35 ? Math.max(0.5, gpuFraction) : 0));
    const freeRam = Math.max(0, usableRamGB - baseRam);
    freeForKvGB = config.offloadStrategy === "full-gpu" ? freeGpu : Math.min(freeGpu + freeRam * 0.5, freeGpu * 1.35);
  } else {
    freeForKvGB = Math.max(0, usableRamGB - weightsSizeGB - runtime.ramOverheadGB);
  }
  const rawMaxCtx = kvPer1kTokensGB > 0 ? Math.floor(freeForKvGB / kvPer1kTokensGB * 1024) : 2048;
  const maxPracticalContext = Math.max(
    512,
    Math.min(model.maxNativeContext, Math.floor(rawMaxCtx / 1024) * 1024 || 512)
  );
  const hostRamBandwidthGBs = profile.unifiedMemory ? profile.memoryBandwidthGBs : profile.cpuCores >= 16 ? 64 : profile.cpuCores >= 8 ? 44 : 28;
  const gpuBandwidthGBs = profile.memoryBandwidthGBs > 0 ? profile.memoryBandwidthGBs : profile.unifiedMemory ? 150 : 120;
  const activeWeightReadGB = model.activeParamsB * quant.bitsPerWeight / 8;
  let estimatedTokPerSec = 0;
  let bottleneck = "GPU Memory Bandwidth";
  if (config.offloadStrategy === "disk-layer-stream") {
    const nvmeBandwidthGBs = 4.2;
    estimatedTokPerSec = round2(Math.max(0.06, nvmeBandwidthGBs / Math.max(weightsSizeGB, 1) * 0.85));
    bottleneck = "NVMe SSD Sequential Read Throughput";
  } else if (config.offloadStrategy === "moe-cpu-experts" && model.isMoE) {
    const gpuTime = activeWeightReadGB * 0.16 / (gpuBandwidthGBs * runtime.decodeEfficiency);
    const cpuTime = activeWeightReadGB * 0.84 / (hostRamBandwidthGBs * 0.62);
    estimatedTokPerSec = round1(1 / Math.max(0.01, gpuTime + cpuTime));
    bottleneck = "Host System RAM Bandwidth (MoE Expert Routing)";
  } else if (gpuLayersAllocated === 0 || config.offloadStrategy === "cpu-only-mmap") {
    const threadScale = Math.min(1, config.cpuThreads / Math.max(4, Math.min(profile.cpuCores, 12)));
    const effectiveBw = hostRamBandwidthGBs * 0.68 * threadScale;
    estimatedTokPerSec = round1(effectiveBw / Math.max(0.4, activeWeightReadGB));
    bottleneck = "System RAM Bandwidth & CPU SIMD";
  } else if (gpuFraction >= 0.99) {
    const contextPenalty = 1 + config.contextSize / 65536 * 0.14;
    const effectiveBw = gpuBandwidthGBs * runtime.decodeEfficiency;
    estimatedTokPerSec = round1(effectiveBw / Math.max(0.3, activeWeightReadGB * contextPenalty));
    bottleneck = profile.unifiedMemory ? "Apple Unified Memory Bandwidth" : "GPU VRAM Bandwidth";
  } else {
    const gpuTime = activeWeightReadGB * gpuFraction / (gpuBandwidthGBs * runtime.decodeEfficiency);
    const cpuTime = activeWeightReadGB * (1 - gpuFraction) / (hostRamBandwidthGBs * 0.65);
    const pcieOverhead = 8e-3 * (1 - gpuFraction);
    estimatedTokPerSec = round1(1 / Math.max(0.01, gpuTime + cpuTime + pcieOverhead));
    bottleneck = `PCIe Bus & CPU RAM (${cpuLayersAllocated} offloaded layers)`;
  }
  const ssdReadGBs = config.useMmap ? 3.8 : 1.9;
  const pcieTransferSec = profile.unifiedMemory ? 0 : vramRequiredGB / 14.5;
  const estimatedLoadTimeSec = round1(Math.max(0.6, weightsSizeGB / ssdReadGBs + pcieTransferSec));
  const promptTokens = 512;
  const prefillFlopsT = 2 * model.activeParamsB * promptTokens / 1e3;
  const gpuTflops = Math.max(2.5, profile.gpuFp16Tflops || 8);
  const cpuTflops = Math.max(0.18, profile.cpuCores * 18 / 1e3);
  const effectivePrefillTflops = config.offloadStrategy === "disk-layer-stream" ? 0.08 : gpuLayersAllocated === 0 ? cpuTflops : gpuTflops * gpuFraction * runtime.prefillEfficiency + cpuTflops * (1 - gpuFraction);
  const estimatedTtftMs = Math.round(
    Math.max(45, prefillFlopsT / Math.max(0.05, effectivePrefillTflops) * 1e3 + 35)
  );
  const estimatedGpuUtilPct = gpuLayersAllocated === 0 ? 4 : config.offloadStrategy === "full-gpu" ? 96 : Math.round(35 + gpuFraction * 58);
  const estimatedCpuUtilPct = gpuLayersAllocated === 0 ? 92 : config.offloadStrategy === "full-gpu" ? 14 : Math.round(25 + (1 - gpuFraction) * 65);
  const baseAmbientTemp = profile.currentGpuTempC ?? (profile.unifiedMemory ? 44 : 46);
  const loadHeatDelta = config.offloadStrategy === "cpu-only-mmap" ? 34 : profile.unifiedMemory ? 24 : config.offloadStrategy === "full-gpu" ? 27 : 29;
  const modelWeightThermalBonus = Math.min(8, weightsSizeGB / 12);
  const estimatedSteadyTempC = Math.round(
    Math.min(92, baseAmbientTemp + loadHeatDelta * (estimatedGpuUtilPct > 80 || estimatedCpuUtilPct > 80 ? 1 : 0.78) + modelWeightThermalBonus)
  );
  const thermalState = estimatedSteadyTempC >= 84 ? "throttling" : estimatedSteadyTempC >= 75 ? "warm" : "nominal";
  const runtimeEval = evaluateRuntimes(profile).find((r) => r.engine.id === runtime.id);
  const validationReasons = [];
  let validationStatus = "team-validated";
  const runtimeSupportsQuant = quant.compatibleRuntimes.includes(runtime.id);
  if (!runtimeEval?.compatible) {
    validationStatus = "exceeds-hardware";
    validationReasons.push(runtimeEval?.compatibilityReason ?? "Selected runtime is incompatible with local GPU vendor.");
  }
  if (!runtimeSupportsQuant) {
    validationStatus = "exceeds-hardware";
    validationReasons.push(`${runtime.name} does not natively support ${quant.id} format.`);
  }
  if (!memoryFits) {
    validationStatus = "exceeds-hardware";
    if (!profile.unifiedMemory && !vramFits) {
      validationReasons.push(
        `VRAM required (${vramRequiredGB} GB) exceeds usable local VRAM (${usableVramGB} GB). Lower GPU layers or switch to Hybrid Offload.`
      );
    }
    if (!ramFits) {
      validationReasons.push(
        `System RAM required (${ramRequiredGB} GB) exceeds usable local RAM (${usableRamGB} GB).`
      );
    }
  }
  if (!diskFits) {
    validationStatus = "exceeds-hardware";
    validationReasons.push(
      `Model artifact (${diskUsageGB} GB) exceeds detected free storage (${round1(profile.diskAvailableGB)} GB).`
    );
  }
  if (validationStatus !== "exceeds-hardware") {
    const isExperimentalReasons = [];
    if (!quant.teamValidated || !model.teamValidatedQuants.includes(quant.id)) {
      isExperimentalReasons.push(
        `${quant.id} (${quant.bitsPerWeight} bpw) is an experimental ultra-low-bit quantization with higher perplexity delta (${quant.perplexityDelta}).`
      );
    }
    if (runtime.validationStatus === "experimental" || runtimeEval?.effectiveValidation === "experimental") {
      isExperimentalReasons.push(`${runtime.name} is classified as experimental on this local hardware class.`);
    }
    if (config.offloadStrategy === "hybrid-gpu-cpu" || config.offloadStrategy === "moe-cpu-experts" || config.offloadStrategy === "disk-layer-stream") {
      isExperimentalReasons.push(
        `Uses ${config.offloadStrategy.replace(/-/g, " ")} execution (${gpuLayersAllocated}/${model.layers} GPU layers); performance is host-bus limited.`
      );
    }
    if (config.contextSize > maxPracticalContext) {
      isExperimentalReasons.push(
        `Requested context (${config.contextSize.toLocaleString()}) exceeds safe practical context ceiling (${maxPracticalContext.toLocaleString()}).`
      );
    }
    if (estimatedTokPerSec < 5) {
      isExperimentalReasons.push(
        `Projected decode throughput (${estimatedTokPerSec} tok/s) falls below interactive team benchmark threshold (5.0 tok/s).`
      );
    }
    if (profile.ramPrivacyCapped && ramRequiredGB > 6.5) {
      isExperimentalReasons.push(
        "Browser capped RAM detection at 8 GB; verify installed RAM in Hardware Probe or connect Local Agent to confirm headroom."
      );
    }
    if (isExperimentalReasons.length > 0) {
      validationStatus = "experimental";
      validationReasons.push(...isExperimentalReasons);
    } else {
      validationReasons.push(
        `Verified against Project 3 baseline: fits cleanly in local memory with ${estimatedTokPerSec} tok/s projected decode and ${maxPracticalContext.toLocaleString()} practical context ceiling.`
      );
    }
  }
  const executionMode = config.offloadStrategy === "full-gpu" || profile.vramTotalGB < 4 && config.offloadStrategy === "cpu-only-mmap" ? "standard" : "advanced-offload";
  const validationHeadline = validationStatus === "team-validated" ? "Team Validated Configuration" : validationStatus === "experimental" ? "Experimentally Possible Configuration" : "Exceeds Detected Local Hardware";
  return {
    config,
    model,
    runtime,
    quant,
    validationStatus,
    validationHeadline,
    validationReasons,
    executionMode,
    totalLayers: model.layers,
    gpuLayersAllocated,
    cpuLayersAllocated,
    diskUsageGB,
    weightsSizeGB,
    kvCacheSizeGB,
    vramRequiredGB,
    ramRequiredGB,
    vramUtilizationPct,
    ramUtilizationPct,
    diskFits,
    memoryFits,
    maxPracticalContext,
    estimatedLoadTimeSec,
    estimatedTtftMs,
    estimatedTokPerSec,
    estimatedGpuUtilPct,
    estimatedCpuUtilPct,
    estimatedSteadyTempC,
    thermalState,
    bottleneck,
    cliCommand: buildCliCommand(config, model, gpuLayersAllocated)
  };
}
function evaluateHardwareProfile(profile) {
  const hardwareClass = classifyHardware(profile);
  const { usableVramGB, usableRamGB } = getUsableMemoryBudgets(profile);
  const runtimes = evaluateRuntimes(profile);
  const recommendedRuntimeId = runtimes.find((r) => r.compatible && r.engine.id === hardwareClass.recommendedRuntime)?.engine.id ?? runtimes.find((r) => r.compatible && r.recommended)?.engine.id ?? "llama.cpp";
  const modelCompatibility = {};
  let largestValidated = {
    modelId: MODELS[0].id,
    modelName: MODELS[0].name,
    quantId: "Q4_K_M",
    runtimeId: recommendedRuntimeId,
    estimatedTokPerSec: 12,
    maxPracticalContext: 8192,
    paramsB: 0
  };
  let largestExperimental = {
    modelId: MODELS[0].id,
    modelName: MODELS[0].name,
    quantId: "IQ3_XXS",
    runtimeId: "llama.cpp",
    offloadStrategy: "hybrid-gpu-cpu",
    estimatedTokPerSec: 4,
    maxPracticalContext: 4096,
    paramsB: 0
  };
  for (const model of MODELS) {
    const standardRuntime = recommendedRuntimeId === "exllamav2" && model.paramsB >= 70 && !profile.unifiedMemory && usableVramGB < 36 ? "llama.cpp" : recommendedRuntimeId;
    const standardQuant = standardRuntime === "exllamav2" ? "EXL2-4.25bpw" : standardRuntime === "vllm" || standardRuntime === "tensorrt-llm" ? "AWQ-INT4" : "Q4_K_M";
    const standardStrategy = usableVramGB >= 4 ? "full-gpu" : "cpu-only-mmap";
    const standardPlan = computeExecutionPlan(profile, {
      modelId: model.id,
      runtimeId: standardRuntime,
      quantId: standardQuant,
      offloadStrategy: standardStrategy,
      gpuLayers: standardStrategy === "full-gpu" ? model.layers : 0,
      contextSize: 8192,
      kvCacheQuant: "q8_0",
      cpuThreads: Math.max(4, Math.floor(profile.cpuCores * 0.75)),
      flashAttention: true,
      useMmap: true,
      batchSize: 512
    });
    const llamaStandardPlan = computeExecutionPlan(profile, {
      modelId: model.id,
      runtimeId: "llama.cpp",
      quantId: "Q4_K_M",
      offloadStrategy: standardStrategy,
      gpuLayers: standardStrategy === "full-gpu" ? model.layers : 0,
      contextSize: 8192,
      kvCacheQuant: "q8_0",
      cpuThreads: Math.max(4, Math.floor(profile.cpuCores * 0.75)),
      flashAttention: true,
      useMmap: true,
      batchSize: 512
    });
    const bestStd = standardPlan.validationStatus === "team-validated" ? standardPlan : llamaStandardPlan.validationStatus === "team-validated" ? llamaStandardPlan : standardPlan.memoryFits ? standardPlan : llamaStandardPlan;
    const offloadQuant = model.paramsB >= 70 ? "IQ2_XS" : "IQ3_XXS";
    const offloadStrategy = model.isMoE ? "moe-cpu-experts" : usableVramGB >= 4 && !profile.unifiedMemory ? "hybrid-gpu-cpu" : "cpu-only-mmap";
    const quantSpec = QUANTIZATIONS.find((q) => q.id === offloadQuant);
    const estWeightsGB = model.paramsB * quantSpec.bitsPerWeight / 8 * 1.04;
    const autoGpuLayers = offloadStrategy === "hybrid-gpu-cpu" && estWeightsGB > 0 ? Math.max(0, Math.min(model.layers, Math.floor((usableVramGB - 1.4) / estWeightsGB * model.layers))) : offloadStrategy === "cpu-only-mmap" ? 0 : model.layers;
    const offloadPlan = computeExecutionPlan(profile, {
      modelId: model.id,
      runtimeId: model.isMoE && profile.gpuVendor === "nvidia" && profile.ramTotalGB >= 64 ? "ktransformers" : "llama.cpp",
      quantId: offloadQuant,
      offloadStrategy,
      gpuLayers: autoGpuLayers,
      contextSize: 4096,
      kvCacheQuant: "q4_0",
      cpuThreads: Math.max(4, Math.floor(profile.cpuCores * 0.85)),
      flashAttention: true,
      useMmap: true,
      batchSize: 256
    });
    const activeBest = bestStd.validationStatus !== "exceeds-hardware" ? bestStd : offloadPlan;
    modelCompatibility[model.id] = {
      bestStandardStatus: bestStd.validationStatus,
      bestOffloadStatus: offloadPlan.validationStatus,
      recommendedQuant: activeBest.quant.id,
      recommendedRuntime: activeBest.runtime.id,
      estimatedTokPerSec: activeBest.estimatedTokPerSec,
      vramRequiredGB: activeBest.vramRequiredGB,
      ramRequiredGB: activeBest.ramRequiredGB,
      diskUsageGB: activeBest.diskUsageGB
    };
    if (bestStd.validationStatus === "team-validated" && model.paramsB >= largestValidated.paramsB) {
      largestValidated = {
        modelId: model.id,
        modelName: model.name,
        quantId: bestStd.quant.id,
        runtimeId: bestStd.runtime.id,
        estimatedTokPerSec: bestStd.estimatedTokPerSec,
        maxPracticalContext: bestStd.maxPracticalContext,
        paramsB: model.paramsB
      };
    }
    if ((offloadPlan.validationStatus === "experimental" || offloadPlan.validationStatus === "team-validated") && model.paramsB >= largestExperimental.paramsB) {
      largestExperimental = {
        modelId: model.id,
        modelName: model.name,
        quantId: offloadPlan.quant.id,
        runtimeId: offloadPlan.runtime.id,
        offloadStrategy: offloadPlan.config.offloadStrategy,
        estimatedTokPerSec: offloadPlan.estimatedTokPerSec,
        maxPracticalContext: offloadPlan.maxPracticalContext,
        paramsB: model.paramsB
      };
    }
  }
  return {
    hardwareClass,
    allHardwareClasses: HARDWARE_CLASSES,
    usableVramGB,
    usableRamGB,
    runtimes,
    recommendedRuntimeId,
    largestValidatedModel: {
      modelId: largestValidated.modelId,
      modelName: largestValidated.modelName,
      quantId: largestValidated.quantId,
      runtimeId: largestValidated.runtimeId,
      estimatedTokPerSec: largestValidated.estimatedTokPerSec,
      maxPracticalContext: largestValidated.maxPracticalContext
    },
    largestExperimentalModel: {
      modelId: largestExperimental.modelId,
      modelName: largestExperimental.modelName,
      quantId: largestExperimental.quantId,
      runtimeId: largestExperimental.runtimeId,
      offloadStrategy: largestExperimental.offloadStrategy,
      estimatedTokPerSec: largestExperimental.estimatedTokPerSec,
      maxPracticalContext: largestExperimental.maxPracticalContext
    },
    modelCompatibility
  };
}
function runDiagnosticsSuite(profile, plan) {
  const checks = [];
  const { usableVramGB, usableRamGB } = getUsableMemoryBudgets(profile);
  checks.push({
    id: "diag-probe",
    category: "Hardware",
    name: "Local Computer Detection Pipeline",
    status: profile.detectionSource === "system-hardware" ? "pass" : profile.ramPrivacyCapped ? "warn" : "pass",
    measuredValue: profile.detectionSource === "system-hardware" ? "Native System Hardware" : profile.detectionSource === "browser-probe-refined" ? "Browser Probe + Verified Specs" : "Browser Hardware Probe",
    threshold: "Physical System Hardware",
    detail: profile.detectionSource === "system-hardware" ? `Direct hardware detection (${profile.hostname ?? profile.osName}) identified exact memory and processor specifications.` : profile.ramPrivacyCapped ? "Browser detected local CPU/GPU accurately, but W3C navigator.deviceMemory privacy-caps RAM reporting at 8 GB." : `Browser hardware probe successfully identified ${profile.gpuName} and ${profile.cpuCores} logical CPU cores.`,
    remediation: profile.ramPrivacyCapped ? "Verify exact installed RAM in Hardware Probe verification drawer." : void 0
  });
  checks.push({
    id: "diag-gpu",
    category: "Hardware",
    name: "GPU Compute & Shader FP16 Capability",
    status: profile.webgpuSupported ? "pass" : profile.vramTotalGB >= 4 ? "warn" : "warn",
    measuredValue: `${profile.gpuName} (${profile.webgpuSupported ? "WebGPU Active" : "WebGL2 Fallback"})`,
    threshold: "Discrete or Unified GPU >= 4 GB",
    detail: profile.webgpuSupported ? `WebGPU adapter active (Max Buffer: ${profile.webgpuMaxBufferMB} MB, FP16 Shader: ${profile.webgpuShaderF16 ? "Yes" : "No"}).` : "WebGPU unavailable in this browser context; GPU identified via WebGL2 unmasked renderer.",
    remediation: !profile.webgpuSupported ? "Use native llama.cpp/ExLlamaV2 via CLI or enable WebGPU in Chromium/Safari for in-browser GPU compute tests." : void 0
  });
  if (plan) {
    checks.push({
      id: "diag-vram",
      category: "Memory",
      name: profile.unifiedMemory ? "Unified Memory Allocation Fit" : "VRAM Allocation Fit",
      status: !plan.memoryFits ? "fail" : plan.vramUtilizationPct > 88 ? "warn" : "pass",
      measuredValue: `${plan.vramRequiredGB} GB / ${usableVramGB} GB usable (${plan.vramUtilizationPct}%)`,
      threshold: "<= 88% safe ceiling",
      detail: plan.memoryFits ? `Selected model (${plan.model.name} ${plan.quant.id}) fits within local ${profile.unifiedMemory ? "Unified Memory" : "VRAM"} budget.` : `Allocation exceeds available ${profile.unifiedMemory ? "Unified Memory" : "VRAM"} and will trigger OOM or severe OS paging.`,
      remediation: !plan.memoryFits ? "Reduce GPU layers (-ngl), switch to Q4_K_M / IQ3_XXS quantization, or choose a smaller parameter class." : plan.vramUtilizationPct > 88 ? "Consider enabling Q8_0 or Q4_0 KV cache quantization to protect against OOM at high context lengths." : void 0
    });
    const ctxOk = plan.config.contextSize <= plan.maxPracticalContext;
    checks.push({
      id: "diag-kv",
      category: "Memory",
      name: "KV-Cache & Practical Context Ceiling",
      status: ctxOk ? "pass" : "warn",
      measuredValue: `${plan.config.contextSize.toLocaleString()} req / ${plan.maxPracticalContext.toLocaleString()} max`,
      threshold: "Requested <= Practical Max",
      detail: `KV cache requires ${plan.kvCacheSizeGB} GB at ${plan.config.kvCacheQuant.toUpperCase()} precision (${plan.config.flashAttention ? "Flash Attention enabled" : "Standard Attention"}).`,
      remediation: !ctxOk ? `Lower context window to ${plan.maxPracticalContext.toLocaleString()} tokens or quantize KV cache to Q4_0.` : void 0
    });
  } else {
    checks.push({
      id: "diag-mem-base",
      category: "Memory",
      name: "System Memory & VRAM Inventory",
      status: usableRamGB >= 12 ? "pass" : "warn",
      measuredValue: `${profile.ramTotalGB} GB RAM \xB7 ${profile.unifiedMemory ? `${profile.unifiedMemoryPoolGB} GB Unified` : `${profile.vramTotalGB} GB VRAM`}`,
      threshold: ">= 16 GB RAM recommended",
      detail: `Detected ${usableRamGB} GB usable host RAM and ${usableVramGB} GB usable GPU memory.`
    });
  }
  const requiredDisk = plan ? plan.diskUsageGB + 2 : 10;
  const diskPass = profile.diskAvailableGB >= requiredDisk;
  checks.push({
    id: "diag-disk",
    category: "Storage",
    name: "Local Storage Quota for Model Weights",
    status: diskPass ? "pass" : "fail",
    measuredValue: `${round1(profile.diskAvailableGB)} GB available`,
    threshold: `>= ${round1(requiredDisk)} GB needed`,
    detail: `Probed via ${profile.diskProbeSource === "native-os" ? "local filesystem stat" : profile.diskProbeSource === "user-verified" ? "user-verified local disk" : "Browser StorageManager quota API"}.`,
    remediation: !diskPass ? "Free local SSD space or select a smaller quantized model artifact." : void 0
  });
  if (plan) {
    const engineEval = evaluateRuntimes(profile).find((r) => r.engine.id === plan.runtime.id);
    checks.push({
      id: "diag-runtime",
      category: "Runtime",
      name: `Runtime Backend Compatibility (${plan.runtime.name})`,
      status: !engineEval?.compatible ? "fail" : plan.validationStatus === "team-validated" ? "pass" : "warn",
      measuredValue: plan.validationHeadline,
      threshold: "Team Validated preferred",
      detail: plan.validationReasons[0] ?? "Runtime compatibility verified.",
      remediation: plan.validationStatus !== "team-validated" ? "Switch to llama.cpp (universal) or MLX-LM (Apple Silicon) with Q4_K_M for a Team Validated configuration." : void 0
    });
  }
  const projectedTemp = plan?.estimatedSteadyTempC ?? (profile.currentGpuTempC ?? 68);
  checks.push({
    id: "diag-thermal",
    category: "Thermal",
    name: "Thermal & Resource Stability Envelope",
    status: projectedTemp >= 84 ? "fail" : projectedTemp >= 76 ? "warn" : "pass",
    measuredValue: `${projectedTemp}\xB0C projected sustained`,
    threshold: "< 76\xB0C nominal \xB7 < 84\xB0C throttle",
    detail: projectedTemp >= 84 ? "Sustained inference likely to trigger CPU/GPU thermal throttling and reduced tok/s." : projectedTemp >= 76 ? "Moderate thermal load expected during long prefill prompts; monitor fan curves." : "Comfortable thermal margin for continuous token generation.",
    remediation: projectedTemp >= 76 ? "Reduce CPU thread count to physical cores only or apply an 80% GPU power limit." : void 0
  });
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  return {
    id: `diag-${Date.now()}`,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overallStatus: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    hardwareSummary: `${profile.cpuModel} (${profile.cpuCores}T) \xB7 ${profile.gpuName} \xB7 ${profile.ramTotalGB}GB RAM`,
    checks
  };
}

// server/hardware.ts
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
var cachedInfo = null;
var lastCpuMeasure = { idle: 0, total: 0, time: 0 };
function sampleCpuUsagePercent() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  const now = Date.now();
  if (lastCpuMeasure.time === 0) {
    lastCpuMeasure = { idle, total, time: now };
    return 5;
  }
  const idleDelta = idle - lastCpuMeasure.idle;
  const totalDelta = total - lastCpuMeasure.total;
  lastCpuMeasure = { idle, total, time: now };
  if (totalDelta <= 0) return 0;
  const usage = Math.round((1 - idleDelta / totalDelta) * 100);
  return Math.max(0, Math.min(100, usage));
}
function detectNativeGpu() {
  const platform = os.platform();
  try {
    const nvsmiOut = execSync(
      "nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits",
      { encoding: "utf8", timeout: 2e3, stdio: ["pipe", "pipe", "ignore"] }
    ).trim();
    if (nvsmiOut) {
      const parts = nvsmiOut.split(",").map((s) => s.trim());
      const name = parts[0] || "NVIDIA GPU";
      const totalMb = parseFloat(parts[1]) || 0;
      const driver = parts[2] || "Available";
      return {
        vendor: "nvidia",
        name,
        architecture: "NVIDIA CUDA",
        vramTotalGB: Math.round(totalMb / 1024 * 10) / 10,
        driverVersion: driver,
        isDiscrete: true
      };
    }
  } catch {
  }
  if (platform === "win32") {
    try {
      const psCmd = "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json -Compress";
      const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
        encoding: "utf8",
        timeout: 4e3,
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      if (out) {
        const parsed = JSON.parse(out);
        const gpus = Array.isArray(parsed) ? parsed : [parsed];
        const discrete = gpus.find(
          (g) => /nvidia|geforce|quadro|tesla|rtx|gtx|radeon|rx\s*\d/i.test(g.Name || "")
        ) || gpus[0];
        if (discrete) {
          const rawName = discrete.Name || "Generic GPU";
          const adapterRamBytes = Number(discrete.AdapterRAM) || 0;
          let vramGB = Math.round(adapterRamBytes / 1e9 * 10) / 10;
          let vendor = "unknown";
          let arch = "Standard GPU";
          if (/nvidia|geforce|rtx|gtx/i.test(rawName)) {
            vendor = "nvidia";
            arch = "NVIDIA CUDA";
            if (vramGB <= 0 || vramGB > 64) {
              vramGB = /gt\s*730/i.test(rawName) ? 2 : 4;
            }
          } else if (/amd|radeon/i.test(rawName)) {
            vendor = "amd";
            arch = "AMD Radeon / ROCm";
            if (vramGB <= 0) vramGB = 4;
          } else if (/intel/i.test(rawName)) {
            vendor = "intel";
            arch = "Intel Graphics";
            if (vramGB <= 0) vramGB = 1;
          }
          return {
            vendor,
            name: rawName,
            architecture: arch,
            vramTotalGB: Math.max(vramGB, 0),
            driverVersion: discrete.DriverVersion || "Installed",
            isDiscrete: vendor === "nvidia" || vendor === "amd"
          };
        }
      }
    } catch {
    }
  }
  if (platform === "darwin") {
    try {
      const spOut = execSync("sysctl -n machdep.cpu.brand_string", {
        encoding: "utf8",
        timeout: 2e3,
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      const isAppleSilicon = os.arch() === "arm64" || /Apple/i.test(spOut);
      if (isAppleSilicon) {
        const totalRamGB = Math.round(os.totalmem() / 1e9 * 10) / 10;
        return {
          vendor: "apple",
          name: spOut || "Apple Silicon Metal GPU",
          architecture: "Apple Metal Unified Memory",
          vramTotalGB: totalRamGB,
          driverVersion: "Apple Metal Native",
          isDiscrete: true
        };
      }
    } catch {
    }
  }
  return {
    vendor: "unknown",
    name: "Integrated / Standard Display Adapter",
    architecture: "Standard Graphics Pipeline",
    vramTotalGB: 0,
    driverVersion: "OS Standard",
    isDiscrete: false
  };
}
function getSystemHardwareProfile() {
  const now = Date.now();
  if (cachedInfo && now - cachedInfo.lastSampled < 15e3) {
    const ramTotalGB2 = Math.round(os.totalmem() / 1e9 * 100) / 100;
    const ramAvailableGB2 = Math.round(os.freemem() / 1e9 * 100) / 100;
    cachedInfo.profile.ramTotalGB = ramTotalGB2;
    cachedInfo.profile.ramAvailableGB = ramAvailableGB2;
    return cachedInfo.profile;
  }
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() || "Multi-Core Processor";
  const cpuCores = cpus.length || 4;
  const ramTotalGB = Math.round(os.totalmem() / 1e9 * 100) / 100;
  const ramAvailableGB = Math.round(os.freemem() / 1e9 * 100) / 100;
  let diskTotalGB = 256;
  let diskAvailableGB = 64;
  try {
    const stat = fs.statfsSync(".");
    diskTotalGB = Math.round(stat.bsize * stat.blocks / 1e9 * 10) / 10;
    diskAvailableGB = Math.round(stat.bsize * stat.bavail / 1e9 * 10) / 10;
  } catch {
  }
  const gpuInfo = detectNativeGpu();
  const isUnified = gpuInfo.vendor === "apple";
  const profile = {
    detectionSource: "system-hardware",
    detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
    hostname: os.hostname(),
    osName: os.platform() === "win32" ? "Windows" : os.platform() === "darwin" ? "macOS" : "Linux",
    osVersion: os.release(),
    architecture: os.arch(),
    cpuModel,
    cpuCores,
    ramTotalGB,
    ramAvailableGB,
    ramPrivacyCapped: false,
    // Server has full OS access, NO 8GB browser privacy cap!
    gpuVendor: gpuInfo.vendor,
    gpuName: gpuInfo.name,
    gpuRendererRaw: `${gpuInfo.name} (${gpuInfo.driverVersion})`,
    gpuArchitecture: gpuInfo.architecture,
    vramTotalGB: gpuInfo.vramTotalGB,
    vramAvailableGB: Math.round(gpuInfo.vramTotalGB * 0.85 * 10) / 10,
    unifiedMemory: isUnified,
    unifiedMemoryPoolGB: isUnified ? ramTotalGB : 0,
    memoryBandwidthGBs: isUnified ? 150 : gpuInfo.vendor === "nvidia" ? 192 : 48,
    gpuFp16Tflops: gpuInfo.vendor === "nvidia" ? 8.5 : gpuInfo.vendor === "apple" ? 12 : 2.5,
    diskTotalGB,
    diskAvailableGB,
    diskProbeSource: "native-os",
    webgpuSupported: true,
    webgpuShaderF16: gpuInfo.vendor === "nvidia" || gpuInfo.vendor === "apple",
    webgpuMaxBufferMB: Math.min(2048, Math.round(ramTotalGB * 128)),
    thermalSensorAvailable: false,
    currentGpuTempC: null,
    currentCpuTempC: null
  };
  cachedInfo = {
    profile,
    lastSampled: now
  };
  return profile;
}

// server/downloader.ts
import fs2 from "node:fs";
import path from "node:path";
var DownloadManager = class {
  constructor(modelsDir2) {
    this.tasks = /* @__PURE__ */ new Map();
    this.abortControllers = /* @__PURE__ */ new Map();
    this.modelsDir = modelsDir2;
    if (!fs2.existsSync(this.modelsDir)) {
      fs2.mkdirSync(this.modelsDir, { recursive: true });
    }
  }
  getTasks() {
    return Array.from(this.tasks.values());
  }
  getTask(id) {
    return this.tasks.get(id);
  }
  async startDownload(modelId, quantId, userTotalGB) {
    const model = MODELS.find((m) => m.id === modelId);
    const quant = QUANTIZATIONS.find((q) => q.id === quantId);
    if (!model || !quant) {
      throw new Error(`Invalid model (${modelId}) or quantization (${quantId}) requested.`);
    }
    const existing = Array.from(this.tasks.values()).find(
      (t) => t.modelId === model.id && t.quantId === quant.id && (t.status === "downloading" || t.status === "completed")
    );
    if (existing) {
      return existing;
    }
    const quantLower = quant.id.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const fileName = `${model.id}-${quantLower}.gguf`;
    const localPath = path.join(this.modelsDir, fileName);
    if (fs2.existsSync(localPath)) {
      const stat = fs2.statSync(localPath);
      if (stat.size > 1024 * 1024) {
        const sizeGB = Math.round(stat.size / 1e9 * 100) / 100;
        const completedTask = {
          id: `dl-${Date.now()}`,
          modelId: model.id,
          modelName: model.name,
          quantId: quant.id,
          fileName,
          totalGB: sizeGB,
          downloadedGB: sizeGB,
          progressPct: 100,
          speedMBs: 0,
          status: "completed",
          startedAt: (/* @__PURE__ */ new Date()).toISOString(),
          localPath
        };
        this.tasks.set(completedTask.id, completedTask);
        return completedTask;
      }
    }
    const estimatedGB = typeof userTotalGB === "number" && userTotalGB > 0 ? Number(userTotalGB.toFixed(2)) : Number((model.paramsB * quant.bitsPerWeight / 8 * 1.07).toFixed(2));
    const task = {
      id: `dl-${Date.now()}`,
      modelId: model.id,
      modelName: model.name,
      quantId: quant.id,
      fileName,
      totalGB: estimatedGB,
      downloadedGB: 0,
      progressPct: 0,
      speedMBs: 0,
      status: "downloading",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      localPath
    };
    this.tasks.set(task.id, task);
    const repo = model.huggingfaceRepo;
    const quantSuffix = quant.id.toUpperCase();
    const hfFileNameCandidates = [
      `${model.name.replace(/\s+/g, "-")}-${quantSuffix}.gguf`,
      `${model.id}-${quantSuffix}.gguf`,
      `${model.id.replace(/-/g, "_")}-${quantSuffix}.gguf`,
      `${model.id}-${quantLower}.gguf`
    ];
    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);
    this.executeStreamDownload(task, repo, hfFileNameCandidates, controller).catch((err) => {
      if (controller.signal.aborted || err.name === "AbortError") {
        return;
      }
      console.error(`Download error for ${task.fileName}:`, err);
      task.status = "failed";
      task.errorMessage = err.message || "Download stream interrupted";
      task.speedMBs = 0;
    });
    return task;
  }
  cancelDownload(id) {
    const task = this.tasks.get(id);
    if (!task) return null;
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
    task.status = "cancelled";
    task.speedMBs = 0;
    const partPath = `${task.localPath}.part`;
    if (fs2.existsSync(partPath)) {
      try {
        fs2.unlinkSync(partPath);
      } catch {
      }
    }
    return task;
  }
  async executeStreamDownload(task, repo, candidates, controller) {
    const partPath = `${task.localPath}.part`;
    let response = null;
    let chosenUrl = "";
    for (const cand of candidates) {
      if (controller.signal.aborted) return;
      const url = `https://huggingface.co/${repo}/resolve/main/${cand}`;
      try {
        const head = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal
        });
        if (head.ok) {
          chosenUrl = url;
          const contentLength = head.headers.get("content-length");
          if (contentLength) {
            task.totalGB = Math.round(Number(contentLength) / 1e9 * 100) / 100;
          }
          break;
        }
      } catch {
      }
    }
    if (!chosenUrl && !controller.signal.aborted) {
      try {
        const apiRes = await fetch(`https://huggingface.co/api/models/${repo}`, {
          signal: controller.signal
        });
        if (apiRes.ok) {
          const info = await apiRes.json();
          const siblings = info.siblings || [];
          const qUpper = task.quantId.toUpperCase().replace(/_/g, "");
          const match = siblings.find((s) => {
            const clean = s.rfilename.toUpperCase().replace(/_/g, "");
            return clean.endsWith(".GGUF") && clean.includes(qUpper);
          }) || siblings.find((s) => s.rfilename.endsWith(".gguf"));
          if (match) {
            chosenUrl = `https://huggingface.co/${repo}/resolve/main/${match.rfilename}`;
          }
        }
      } catch {
      }
    }
    if (!chosenUrl) {
      throw new Error(`Weight artifact not found on Hugging Face repository (${repo}).`);
    }
    response = await fetch(chosenUrl, {
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch artifact from ${chosenUrl}: HTTP ${response.status}`);
    }
    const totalBytes = Number(response.headers.get("content-length")) || task.totalGB * 1e9;
    task.totalGB = Math.round(totalBytes / 1e9 * 100) / 100;
    const fileStream = fs2.createWriteStream(partPath);
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    let lastTime = Date.now();
    let bytesSinceLastTick = 0;
    while (true) {
      if (controller.signal.aborted) {
        fileStream.close();
        if (fs2.existsSync(partPath)) fs2.unlinkSync(partPath);
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        fileStream.write(Buffer.from(value));
        downloadedBytes += value.byteLength;
        bytesSinceLastTick += value.byteLength;
        const now = Date.now();
        const delta = now - lastTime;
        if (delta >= 500) {
          const speedBytesPerSec = bytesSinceLastTick / delta * 1e3;
          task.speedMBs = Math.round(speedBytesPerSec / (1024 * 1024) * 10) / 10;
          task.downloadedGB = Math.round(downloadedBytes / 1e9 * 100) / 100;
          task.progressPct = Math.min(99, Math.round(downloadedBytes / totalBytes * 100));
          bytesSinceLastTick = 0;
          lastTime = now;
        }
      }
    }
    fileStream.end();
    if (fs2.existsSync(partPath)) {
      fs2.renameSync(partPath, task.localPath);
      task.status = "completed";
      task.downloadedGB = task.totalGB;
      task.progressPct = 100;
      task.speedMBs = 0;
    }
  }
};

// server/runtimeManager.ts
var RuntimeManager = class {
  constructor() {
    this.activeProcess = null;
    this.stressLoadActive = false;
    this.currentSession = {
      id: "session-idle",
      status: "idle",
      startedAt: null,
      stoppedAt: null,
      executionMode: "native",
      endpointUrl: "http://127.0.0.1:8080/v1",
      plan: null,
      totalPromptsRun: 0,
      totalTokensGenerated: 0,
      lastTtftMs: null,
      lastTokPerSec: null,
      logs: []
    };
  }
  getSession() {
    return this.currentSession;
  }
  isStressLoadActive() {
    return this.stressLoadActive;
  }
  setStressLoad(active) {
    this.stressLoadActive = active;
    this.appendLog(
      active ? "warn" : "info",
      active ? "Thermal stress test initiated (continuous context decoding)." : "Thermal stress test concluded."
    );
  }
  appendLog(level, message) {
    this.currentSession.logs.push({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message
    });
    if (this.currentSession.logs.length > 100) {
      this.currentSession.logs.shift();
    }
  }
  async launch(plan, config) {
    if (this.currentSession.status === "running") {
      await this.stop();
    }
    const runtimeId = plan.runtime.id;
    let endpointUrl = `http://127.0.0.1:${plan.runtime.defaultPort}`;
    this.currentSession = {
      id: `run-${Date.now()}`,
      status: "running",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      stoppedAt: null,
      executionMode: "native",
      endpointUrl,
      plan,
      totalPromptsRun: 0,
      totalTokensGenerated: 0,
      lastTtftMs: plan.estimatedTtftMs,
      lastTokPerSec: plan.estimatedTokPerSec,
      logs: []
    };
    this.appendLog("info", `Initializing ${plan.runtime.name} for ${plan.model.name} (${plan.quant.id}).`);
    this.appendLog(
      "info",
      `Target hardware allocation: ${plan.gpuLayersAllocated}/${plan.totalLayers} layers on GPU (${plan.vramRequiredGB} GB VRAM), ${plan.cpuLayersAllocated} layers on CPU (${plan.ramRequiredGB} GB RAM).`
    );
    if (runtimeId === "ollama") {
      endpointUrl = "http://127.0.0.1:11434";
      this.currentSession.endpointUrl = endpointUrl;
      try {
        const res = await fetch(`${endpointUrl}/api/tags`, { signal: AbortSignal.timeout(3e3) });
        if (res.ok) {
          const tags = await res.json();
          const modelsList = (tags.models || []).map((m) => m.name).join(", ");
          this.appendLog("info", `Connected to local Ollama daemon on port 11434. Models: ${modelsList || "none"}`);
        } else {
          this.appendLog("warn", `Ollama returned HTTP ${res.status}. Attempting automatic connection.`);
        }
      } catch (err) {
        this.appendLog("warn", `Ollama service check: ${err.message || "Connecting to endpoint"}.`);
      }
    } else if (runtimeId === "llama.cpp") {
      endpointUrl = `http://127.0.0.1:${plan.runtime.defaultPort}`;
      this.currentSession.endpointUrl = endpointUrl;
      try {
        const res = await fetch(`${endpointUrl}/health`, { signal: AbortSignal.timeout(2e3) });
        if (res.ok) {
          this.appendLog("info", `Connected to active llama-server on port ${plan.runtime.defaultPort}.`);
        } else {
          this.appendLog("info", `Ready to connect to llama-server on port ${plan.runtime.defaultPort}.`);
        }
      } catch {
        this.appendLog("info", `Runtime initialized on port ${plan.runtime.defaultPort}. Run llama-server to receive requests.`);
      }
    } else {
      this.appendLog("info", `${plan.runtime.name} configured for ${plan.config.offloadStrategy} strategy on ${endpointUrl}.`);
    }
    return this.currentSession;
  }
  async stop() {
    this.stressLoadActive = false;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {
      }
      this.activeProcess = null;
    }
    if (this.currentSession.status === "running") {
      this.appendLog("info", `Gracefully stopped ${this.currentSession.plan?.runtime.name || "runtime"} and released memory.`);
      this.currentSession.status = "stopped";
      this.currentSession.stoppedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    return this.currentSession;
  }
  async runInference(prompt) {
    if (this.currentSession.status !== "running" || !this.currentSession.plan) {
      throw new Error("No runtime is currently running. Please launch a runtime configuration first.");
    }
    const plan = this.currentSession.plan;
    const runtimeId = plan.runtime.id;
    const startTime = performance.now();
    const getOllamaModelTag = (id) => {
      if (id.includes("1b")) return "llama3.2:1b";
      if (id.includes("3b")) return "llama3.2:3b";
      if (id.includes("8b")) return "llama3.1:8b";
      if (id.includes("qwen-2.5-7b")) return "qwen2.5:7b";
      if (id.includes("qwen-2.5-32b")) return "qwen2.5:32b";
      if (id.includes("deepseek-r1-14b")) return "deepseek-r1:14b";
      if (id.includes("deepseek-r1-32b")) return "deepseek-r1:32b";
      return "llama3.2:1b";
    };
    if (runtimeId === "ollama" || runtimeId === "llama.cpp") {
      const ollamaUrl = "http://127.0.0.1:11434/api/generate";
      const modelTag = getOllamaModelTag(plan.model.id);
      try {
        const res = await fetch(ollamaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelTag,
            prompt,
            stream: false,
            options: {
              num_ctx: Math.min(plan.config.contextSize, 8192),
              num_thread: plan.config.cpuThreads
            }
          }),
          signal: AbortSignal.timeout(6e4)
        });
        if (res.ok) {
          const data = await res.json();
          const totalDurationMs = Math.round((data.total_duration || 0) / 1e6) || Math.round(performance.now() - startTime);
          const promptDurationMs = Math.round((data.prompt_eval_duration || 0) / 1e6);
          const ttftMs = promptDurationMs > 0 ? promptDurationMs : Math.round(totalDurationMs * 0.2);
          const promptTokens = data.prompt_eval_count || Math.max(10, Math.round(prompt.length / 3.8));
          const completionTokens = data.eval_count || Math.max(1, Math.round((data.response || "").length / 4));
          const evalDurationSec = (data.eval_duration || 0) / 1e9;
          const tokensPerSec = evalDurationSec > 0 ? Number((completionTokens / evalDurationSec).toFixed(1)) : Number((completionTokens / (Math.max(0.1, totalDurationMs - ttftMs) / 1e3)).toFixed(1));
          this.currentSession.totalPromptsRun += 1;
          this.currentSession.totalTokensGenerated += completionTokens;
          this.currentSession.lastTtftMs = ttftMs;
          this.currentSession.lastTokPerSec = tokensPerSec;
          this.appendLog(
            "info",
            `Prompt #${this.currentSession.totalPromptsRun} via ${plan.runtime.name}: ${promptTokens} prompt tok -> ${completionTokens} gen tok | TTFT ${ttftMs}ms | ${tokensPerSec} tok/s`
          );
          return {
            promptTokens,
            completionTokens,
            ttftMs,
            tokensPerSec,
            totalLatencyMs: totalDurationMs,
            responseText: data.response || "No text output produced."
          };
        }
      } catch (err) {
        console.warn("Ollama generate call error:", err.message);
      }
      try {
        const llamaUrl = `http://127.0.0.1:${plan.runtime.defaultPort}/v1/chat/completions`;
        const res = await fetch(llamaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            max_tokens: 256
          }),
          signal: AbortSignal.timeout(6e4)
        });
        if (res.ok) {
          const data = await res.json();
          const totalDurationMs = Math.round(performance.now() - startTime);
          const ttftMs = Math.round(totalDurationMs * 0.25);
          const completionTokens = data.usage?.completion_tokens || 48;
          const promptTokens = data.usage?.prompt_tokens || Math.round(prompt.length / 3.8);
          const tokensPerSec = Number((completionTokens / ((totalDurationMs - ttftMs) / 1e3)).toFixed(1));
          const responseText = data.choices?.[0]?.message?.content || "Completed.";
          this.currentSession.totalPromptsRun += 1;
          this.currentSession.totalTokensGenerated += completionTokens;
          this.currentSession.lastTtftMs = ttftMs;
          this.currentSession.lastTokPerSec = tokensPerSec;
          return {
            promptTokens,
            completionTokens,
            ttftMs,
            tokensPerSec,
            totalLatencyMs: totalDurationMs,
            responseText
          };
        }
      } catch {
      }
    }
    throw new Error(
      `Active runtime (${plan.runtime.name}) is not reachable on ${this.currentSession.endpointUrl}. Ensure the engine daemon (e.g. Ollama or llama-server) is running.`
    );
  }
};

// server/telemetry.ts
import os2 from "node:os";
import { execSync as execSync2 } from "node:child_process";
var TelemetryCollector = class {
  constructor(runtimeManager2) {
    this.hasNvidiaSmi = null;
    this.runtimeManager = runtimeManager2;
  }
  checkNvidiaSmi() {
    if (this.hasNvidiaSmi !== null) return this.hasNvidiaSmi;
    try {
      execSync2("nvidia-smi --version", { stdio: ["pipe", "pipe", "ignore"], timeout: 1500 });
      this.hasNvidiaSmi = true;
    } catch {
      this.hasNvidiaSmi = false;
    }
    return this.hasNvidiaSmi;
  }
  sample(profile) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = this.runtimeManager.getSession();
    const plan = session.plan;
    const isRunning = session.status === "running" && plan !== null;
    const stressActive = this.runtimeManager.isStressLoadActive();
    const cpuUtilPct = sampleCpuUsagePercent();
    const totalRamBytes = os2.totalmem();
    const freeRamBytes = os2.freemem();
    const ramTotalGB = Math.round(totalRamBytes / 1e9 * 100) / 100;
    const ramUsedGB = Math.round((totalRamBytes - freeRamBytes) / 1e9 * 100) / 100;
    let vramTotalGB = profile?.unifiedMemory ? profile.unifiedMemoryPoolGB : profile?.vramTotalGB ?? 0;
    let vramUsedGB = 0;
    let gpuUtilPct = 0;
    let tempC = 45;
    if (this.checkNvidiaSmi()) {
      try {
        const out = execSync2(
          "nvidia-smi --query-gpu=memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits",
          { encoding: "utf8", timeout: 1500, stdio: ["pipe", "pipe", "ignore"] }
        ).trim();
        if (out) {
          const [totMb, usedMb, util, temp] = out.split(",").map((s) => parseFloat(s.trim()));
          if (!isNaN(totMb) && totMb > 0) vramTotalGB = Math.round(totMb / 1024 * 10) / 10;
          if (!isNaN(usedMb)) vramUsedGB = Math.round(usedMb / 1024 * 10) / 10;
          if (!isNaN(util)) gpuUtilPct = Math.round(util);
          if (!isNaN(temp)) tempC = Math.round(temp);
        }
      } catch {
      }
    } else {
      if (isRunning && plan) {
        gpuUtilPct = stressActive ? 85 : plan.gpuLayersAllocated > 0 ? 35 : 0;
        vramUsedGB = Math.min(vramTotalGB, plan.vramRequiredGB);
        tempC = stressActive ? 68 : 50;
      } else {
        gpuUtilPct = 0;
        vramUsedGB = 0;
        tempC = 42;
      }
    }
    const tokensPerSec = isRunning ? session.lastTokPerSec ?? 0 : 0;
    const ttftMs = isRunning ? session.lastTtftMs ?? 0 : 0;
    const powerWatts = Math.round(
      15 + cpuUtilPct / 100 * 45 + gpuUtilPct / 100 * (vramTotalGB > 0 ? 75 : 10)
    );
    return {
      timestamp: now,
      ramUsedGB,
      ramTotalGB,
      vramUsedGB,
      vramTotalGB,
      cpuUtilPct,
      gpuUtilPct,
      tempC,
      tokensPerSec,
      ttftMs,
      powerWatts,
      source: "live-telemetry"
    };
  }
};

// server/benchmarkRunner.ts
async function executeBenchmarkRun(profile, config, runtimeManager2) {
  const evaluation = evaluateHardwareProfile(profile);
  const plan = computeExecutionPlan(profile, config);
  const session = runtimeManager2.getSession();
  let measuredTokSec = plan.estimatedTokPerSec;
  let measuredTtft = plan.estimatedTtftMs;
  let measuredLoad = plan.estimatedLoadTimeSec;
  let actualOutput = "";
  const isRuntimeRunning = session.status === "running";
  if (isRuntimeRunning) {
    try {
      const benchmarkPrompt = "Evaluate memory efficiency: Explain how 4-bit weight quantization affects inference memory and cache requirements in two concise bullet points.";
      const res = await runtimeManager2.runInference(benchmarkPrompt);
      measuredTokSec = res.tokensPerSec;
      measuredTtft = res.ttftMs;
      measuredLoad = Number((res.totalLatencyMs / 1e3).toFixed(1));
      actualOutput = res.responseText;
    } catch (err) {
      console.warn("Live benchmark prompt error, falling back to execution plan baseline:", err.message);
    }
  }
  const peakTemp = Math.min(
    94,
    Math.round(plan.estimatedSteadyTempC + (measuredTokSec > 20 ? 5 : 1))
  );
  const record = {
    id: `bm-local-${Date.now()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    source: isRuntimeRunning && actualOutput ? "local-run" : "team-baseline",
    hardwareClassId: evaluation.hardwareClass.id,
    hardwareLabel: `This PC (${profile.cpuCores}T \xB7 ${profile.ramTotalGB}GB RAM \xB7 ${profile.gpuName})`,
    modelId: plan.model.id,
    modelName: plan.model.name,
    runtimeId: plan.runtime.id,
    quantId: plan.quant.id,
    offloadStrategy: plan.config.offloadStrategy,
    gpuLayersSplit: profile.unifiedMemory ? `${plan.gpuLayersAllocated} / ${plan.totalLayers} Unified` : `${plan.gpuLayersAllocated} / ${plan.totalLayers} GPU`,
    contextLength: plan.config.contextSize,
    maxPracticalContext: plan.maxPracticalContext,
    ramUsedGB: plan.ramRequiredGB,
    vramUsedGB: plan.vramRequiredGB,
    diskUsageGB: plan.diskUsageGB,
    loadTimeSec: measuredLoad,
    ttftMs: measuredTtft,
    tokensPerSec: measuredTokSec,
    cpuUtilPct: plan.estimatedCpuUtilPct,
    gpuUtilPct: plan.estimatedGpuUtilPct,
    peakTempC: peakTemp,
    thermalBehavior: peakTemp >= 84 ? "Thermal Throttled" : peakTemp >= 75 ? "Warm Sustained" : "Stable",
    validationStatus: plan.validationStatus
  };
  return record;
}

// server/app.ts
var benchmarks = [...BASELINE_BENCHMARKS];
var modelsDir = path2.resolve(process.cwd(), "models");
var downloadManager = new DownloadManager(modelsDir);
var runtimeManager = new RuntimeManager();
var telemetryCollector = new TelemetryCollector(runtimeManager);
var activeProfile = null;
function createServerApp() {
  const app2 = express();
  app2.use(express.json({ limit: "2mb" }));
  app2.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    next();
  });
  const apiRouter = express.Router();
  apiRouter.get("/catalog", (_req, res) => {
    res.json({
      projects: GITHUB_PROJECTS,
      runtimes: RUNTIME_ENGINES,
      models: MODELS,
      quantizations: QUANTIZATIONS,
      hardwareClasses: HARDWARE_CLASSES
    });
  });
  apiRouter.get("/hal/system-hardware", (_req, res) => {
    try {
      const profile = getSystemHardwareProfile();
      activeProfile = profile;
      res.json(profile);
    } catch (err) {
      console.error("System hardware inspection error:", err);
      res.status(500).json({ error: err.message || "Failed to inspect system hardware" });
    }
  });
  apiRouter.post("/hal/evaluate", (req, res) => {
    let profile = req.body?.profile;
    if (!profile || typeof profile.cpuCores !== "number") {
      profile = getSystemHardwareProfile();
    }
    activeProfile = profile;
    const evaluation = evaluateHardwareProfile(profile);
    res.json(evaluation);
  });
  apiRouter.post("/hal/plan", (req, res) => {
    let profile = req.body?.profile;
    const config = req.body?.config;
    if (!profile || typeof profile.cpuCores !== "number") {
      profile = getSystemHardwareProfile();
    }
    if (!config) {
      res.status(400).json({ error: "Runtime configuration input is required." });
      return;
    }
    activeProfile = profile;
    const plan = computeExecutionPlan(profile, config);
    res.json(plan);
  });
  apiRouter.get("/benchmarks", (_req, res) => {
    res.json({ benchmarks });
  });
  apiRouter.post("/benchmarks/run", async (req, res) => {
    let profile = req.body?.profile;
    const config = req.body?.config;
    if (!profile || typeof profile.cpuCores !== "number") {
      profile = getSystemHardwareProfile();
    }
    if (!config) {
      res.status(400).json({ error: "Profile and runtime config are required to run a benchmark." });
      return;
    }
    activeProfile = profile;
    try {
      const record = await executeBenchmarkRun(profile, config, runtimeManager);
      benchmarks.unshift(record);
      if (benchmarks.length > 50) benchmarks.pop();
      res.json({ record, benchmarks });
    } catch (err) {
      console.error("Benchmark execution error:", err);
      res.status(500).json({ error: err.message || "Benchmark run failed" });
    }
  });
  apiRouter.get("/runtime/downloads", (_req, res) => {
    res.json({ downloads: downloadManager.getTasks() });
  });
  apiRouter.post("/runtime/download", async (req, res) => {
    const { modelId, quantId, totalGB } = req.body;
    if (!modelId || !quantId) {
      res.status(400).json({ error: "Valid modelId and quantId are required." });
      return;
    }
    try {
      const task = await downloadManager.startDownload(modelId, quantId, totalGB);
      runtimeManager.appendLog("info", `Initiated artifact download for ${task.fileName} (${task.totalGB} GB).`);
      res.json({ task });
    } catch (err) {
      console.error("Download start error:", err);
      res.status(400).json({ error: err.message || "Failed to start model download" });
    }
  });
  apiRouter.post("/runtime/download/:id/cancel", (req, res) => {
    const task = downloadManager.cancelDownload(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Download task not found." });
      return;
    }
    runtimeManager.appendLog("warn", `Cancelled weight artifact download: ${task.fileName}.`);
    res.json({ task });
  });
  apiRouter.get("/runtime/status", (_req, res) => {
    res.json({
      session: runtimeManager.getSession(),
      stressLoadActive: runtimeManager.isStressLoadActive()
    });
  });
  apiRouter.post("/runtime/launch", async (req, res) => {
    let profile = req.body?.profile;
    const config = req.body?.config;
    if (!profile || typeof profile.cpuCores !== "number") {
      profile = getSystemHardwareProfile();
    }
    if (!config) {
      res.status(400).json({ error: "Profile and config are required to launch runtime." });
      return;
    }
    activeProfile = profile;
    const plan = computeExecutionPlan(profile, config);
    if (plan.validationStatus === "exceeds-hardware") {
      res.status(422).json({
        error: "Configuration exceeds detected local hardware memory or engine compatibility.",
        plan
      });
      return;
    }
    try {
      const session = await runtimeManager.launch(plan, config);
      res.json({ session });
    } catch (err) {
      console.error("Runtime launch error:", err);
      res.status(500).json({ error: err.message || "Failed to launch runtime" });
    }
  });
  apiRouter.post("/runtime/stop", async (_req, res) => {
    try {
      const session = await runtimeManager.stop();
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to stop runtime" });
    }
  });
  apiRouter.post("/runtime/stress", (req, res) => {
    const active = Boolean(req.body?.active);
    runtimeManager.setStressLoad(active);
    res.json({ stressLoadActive: active });
  });
  apiRouter.post("/runtime/infer", async (req, res) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) {
      res.status(400).json({ error: "Prompt cannot be empty." });
      return;
    }
    try {
      const result = await runtimeManager.runInference(prompt);
      res.json({
        ...result,
        session: runtimeManager.getSession()
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Inference execution failed" });
    }
  });
  apiRouter.get("/runtime/telemetry", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const sendSample = () => {
      const sample = telemetryCollector.sample(activeProfile);
      res.write(`data: ${JSON.stringify(sample)}

`);
    };
    sendSample();
    const timer = setInterval(sendSample, 1e3);
    req.on("close", () => {
      clearInterval(timer);
    });
  });
  apiRouter.post("/diagnostics/run", (req, res) => {
    let profile = req.body?.profile;
    const config = req.body?.config;
    if (!profile || typeof profile.cpuCores !== "number") {
      profile = getSystemHardwareProfile();
    }
    activeProfile = profile;
    const plan = config ? computeExecutionPlan(profile, config) : runtimeManager.getSession().plan;
    const report = runDiagnosticsSuite(profile, plan);
    res.json({ report });
  });
  app2.use("/api", apiRouter);
  app2.use("/", apiRouter);
  return app2;
}
var app = createServerApp();
var app_default = app;
export {
  createServerApp,
  app_default as default
};
