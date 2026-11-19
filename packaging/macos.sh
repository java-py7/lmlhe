#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "======================================================================="
echo "  Large-Model-on-Light-Hardware Engine: macOS Launcher"
echo "======================================================================="

# 1. Architecture Check
ARCH=$(uname -m)
echo "[1/6] Inspecting macOS architecture: $ARCH"
if [ "$ARCH" = "arm64" ]; then
    echo "  Detected Apple Silicon (Unified Memory Architecture)."
else
    echo "  Detected Intel x86_64 Mac."
fi

# 2. Python Environment Check
echo "[2/6] Verifying Python 3 installation..."
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] python3 could not be found. Please install Python 3.10+ (e.g. via brew install python)."
    exit 1
fi

PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
echo "  Found Python $PYTHON_VER"

if ! python3 -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" &>/dev/null; then
    echo "[ERROR] Python 3.10 or higher is required. Found $PYTHON_VER."
    exit 1
fi

# 3. Virtual Environment Creation & Activation
echo "[3/6] Configuring virtual environment..."
if [ ! -d ".venv" ]; then
    echo "  Creating .venv virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# 4. Dependency Installation
echo "[4/6] Verifying required Python dependencies..."
python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet -r requirements.txt

# 5. Runtime Availability Check & Guidance
echo "[5/6] Probing local inference runtimes..."
LLAMA_FOUND=0
OLLAMA_FOUND=0

if command -v llama-server &>/dev/null || [ -f "/opt/homebrew/bin/llama-server" ] || [ -f "/usr/local/bin/llama-server" ]; then
    LLAMA_FOUND=1
fi

if command -v ollama &>/dev/null || curl -s --connect-timeout 1 http://127.0.0.1:11434/api/version &>/dev/null; then
    OLLAMA_FOUND=1
fi

if [ $LLAMA_FOUND -eq 1 ]; then
    echo "  [OK] llama.cpp runtime binary detected."
else
    echo "  [NOTICE] llama-server not found in standard paths."
    echo "           You can install via 'brew install llama.cpp' or configure the path in the UI."
fi

if [ $OLLAMA_FOUND -eq 1 ]; then
    echo "  [OK] Ollama runtime service detected."
else
    echo "  [NOTICE] Ollama service not running at http://127.0.0.1:11434."
    echo "           To use Ollama models, install and start Ollama (https://ollama.com)."
fi

# 6. Local Paths & Launch
echo "[6/6] Verifying storage and model paths..."
mkdir -p storage models

echo ""
echo "======================================================================="
echo "  Launching Large-Model-on-Light-Hardware Engine"
echo "  Dashboard URL: http://127.0.0.1:8000"
echo "  Press Ctrl+C to terminate."
echo "======================================================================="
echo ""

if command -v open &>/dev/null; then
    (sleep 1 && open "http://127.0.0.1:8000" &>/dev/null &)
fi

exec python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level info
