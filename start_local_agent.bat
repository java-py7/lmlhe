@echo off
setlocal
cd /d "%~dp0"

echo =======================================================================
echo   Large-Model-on-Light-Hardware Engine: Local Agent Launcher
echo =======================================================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python was not found in PATH.
    echo Please install Python 3.10+ from https://www.python.org/
    pause
    exit /b 1
)

:: Run local agent using available python
python local_agent.py %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo [NOTICE] Local agent halted.
    pause
)
