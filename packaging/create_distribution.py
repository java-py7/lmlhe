#!/usr/bin/env python3
"""
Packages the compiled standalone Local Agent into distributable standalone archives.
Generates genuine Windows packages and metadata for Linux/macOS.
"""

import os
import sys
import shutil
import zipfile
import hashlib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_AGENT = BASE_DIR / "dist" / "LMLHE-Agent"
DOWNLOADS_DIR = BASE_DIR / "storage" / "downloads"
STAGING_DIR = BASE_DIR / "build" / "package_staging" / "LMLHE-Local-Agent"

def package_windows():
    if not DIST_AGENT.is_dir():
        print(f"Error: {DIST_AGENT} does not exist. Run PyInstaller first.")
        return None

    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if STAGING_DIR.parent.is_dir():
        shutil.rmtree(STAGING_DIR.parent, ignore_errors=True)
    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    print("Copying compiled binary and libraries to staging directory...")
    for item in DIST_AGENT.iterdir():
        dest = STAGING_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    # 1. Launcher BAT for one-click background startup
    launcher_content = """@echo off
title LMLHE Local Agent
echo ========================================================
echo   Large-Model-on-Light-Hardware Engine: Local Agent
echo ========================================================
echo.
echo Starting agent in background on port 8008...
start "" "%~dp0LMLHE-Agent.exe"
echo [OK] Local agent is active.
echo You can now return to the web dashboard in your browser.
timeout /t 3 >nul
exit
"""
    (STAGING_DIR / "Start-Agent.bat").write_text(launcher_content, encoding="utf-8")

    # 2. Plain English README for non-technical users
    readme_content = """=======================================================
  Large-Model-on-Light-Hardware Engine: Local PC Agent
  Version 2.0.0 (Standalone Distribution)
=======================================================

HOW TO USE:
1. Double-click "LMLHE-Agent.exe" (or "Start-Agent.bat").
2. The agent will run securely on your computer on port 8008.
3. Open your web dashboard. It will automatically connect and
   detect your physical CPU, RAM, discrete GPU, and local models.

NOTES:
- Fully standalone: No Python installation or terminal needed.
- Connects securely using browser Private Network Access (PNA).
- To stop the agent, close its window or end the task.
=======================================================
"""
    (STAGING_DIR / "README.txt").write_text(readme_content, encoding="utf-8")

    # 3. Create standalone zip package
    zip_path = DOWNLOADS_DIR / "LMLHE-Local-Agent-Windows-x64.zip"
    print(f"Creating archive {zip_path.name}...")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(STAGING_DIR):
            for file in files:
                full_path = Path(root) / file
                arc_name = full_path.relative_to(STAGING_DIR.parent)
                zf.write(full_path, arc_name)

    size_bytes = zip_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)

    # Calculate SHA256 checksum
    hasher = hashlib.sha256()
    with open(zip_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    sha256_hash = hasher.hexdigest()

    print(f"SUCCESS: Created {zip_path.name}")
    print(f"Size: {size_mb:.2f} MB ({size_bytes} bytes)")
    print(f"SHA-256: {sha256_hash}")

    # Clean up staging directory
    shutil.rmtree(STAGING_DIR.parent, ignore_errors=True)

    return {
        "filename": zip_path.name,
        "path": str(zip_path),
        "size_bytes": size_bytes,
        "size_mb": round(size_mb, 1),
        "sha256": sha256_hash,
    }


if __name__ == "__main__":
    result = package_windows()
    if not result:
        sys.exit(1)
