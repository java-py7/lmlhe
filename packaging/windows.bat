@echo off
setlocal enabledelayedexpansion

echo =======================================================================
echo   Large-Model-on-Light-Hardware Engine: Windows Launcher
echo =======================================================================

cd /d "%~dp0\.."

:: 1. Architecture Check
echo [1/6] Inspecting system architecture...
echo   Detected architecture: %PROCESSOR_ARCHITECTURE%

:: 2. Python Environment Check
echo [2/6] Verifying Python installation...
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python was not found in PATH.
    echo Please install Python 3.10 or higher from https://www.python.org/
    echo Ensure 'Add Python to PATH' is selected during installation.
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%I in ('python --version 2^>^&1') do set PYTHON_VER=%%I
echo   Found Python %PYTHON_VER%

python -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python 3.10+ is required. Found %PYTHON_VER%.
    pause
    exit /b 1
)

:: 3. Virtual Environment Creation & Activation
echo [3/6] Configuring isolated virtual environment...
if not exist ".venv" (
    echo   Creating .venv virtual environment...
    python -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

:: 4. Dependency Installation
echo [4/6] Checking required Python dependencies...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Dependency installation failed. Check internet connection.
    pause
    exit /b 1
)

:: 5. Runtime Availability Check & Guidance
echo [5/6] Probing local inference runtimes...
set LLAMA_FOUND=0
set OLLAMA_FOUND=0

where llama-server >nul 2>&1
if %ERRORLEVEL% equ 0 set LLAMA_FOUND=1
if exist "llamacpp\llama-server.exe" set LLAMA_FOUND=1
if exist "%ProgramFiles%\llama.cpp\llama-server.exe" set LLAMA_FOUND=1
if exist "%LOCALAPPDATA%\Programs\llama.cpp\llama-server.exe" set LLAMA_FOUND=1

where ollama >nul 2>&1
if %ERRORLEVEL% equ 0 set OLLAMA_FOUND=1
curl.exe -s http://127.0.0.1:11434/api/version >nul 2>&1
if %ERRORLEVEL% equ 0 set OLLAMA_FOUND=1

if %LLAMA_FOUND% equ 1 (
    echo   [OK] llama.cpp runtime binary detected.
) else (
    echo   [NOTICE] llama-server executable not found in default paths.
    echo            You can configure a custom binary path in the Web Dashboard.
)

if %OLLAMA_FOUND% equ 1 (
    echo   [OK] Ollama runtime service detected.
) else (
    echo   [NOTICE] Ollama service not detected at http://127.0.0.1:11434.
    echo            If you wish to use Ollama, install it from https://ollama.com/
)

:: 6. Storage Directories Setup & Application Launch
echo [6/6] Verifying storage and model paths...
if not exist "storage" mkdir storage
if not exist "models" mkdir models

echo.
echo =======================================================================
echo   Launching Large-Model-on-Light-Hardware Engine
echo   Dashboard URL: http://127.0.0.1:8000
echo   Press Ctrl+C to terminate the engine.
echo =======================================================================
echo.

start "" "http://127.0.0.1:8000"

python -m uvicorn main:app --host 127.0.0.1 --port 8000 --log-level info

pause
