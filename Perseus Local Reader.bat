@echo off
rem Perseus Local Reader launcher for Windows.
rem
rem Resolves the repository root from this file's own location (so the
rem extracted folder can be placed anywhere, including a path with spaces),
rem makes sure the bootstrapped Python runtime exists, and then starts the
rem pywebview shell with no console window. See
rem .developer\windows-app\DESIGN.md for the full design.
rem
rem This file intentionally uses ASCII-only text (including comments) so
rem messages do not get mangled on a cp932 console.

setlocal

title Perseus Local Reader

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "RUNTIME_PYTHONW=%ROOT%\.developer\data\vendor\windows-runtime\python\pythonw.exe"
set "BOOTSTRAP_PS1=%ROOT%\.developer\windows-app\bootstrap.ps1"
set "SHELL_PY=%ROOT%\.developer\windows-app\shell.py"

if not exist "%BOOTSTRAP_PS1%" (
    echo Setup script not found:
    echo   %BOOTSTRAP_PS1%
    echo The extracted folder may be incomplete. Please re-download the ZIP.
    pause
    exit /b 1
)

if not exist "%RUNTIME_PYTHONW%" (
    echo Setting up the Python runtime for the first run.
    echo This requires internet access and may take a few minutes.
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -File "%BOOTSTRAP_PS1%"
    if errorlevel 1 (
        echo.
        echo Setup failed. See the messages above for details.
        pause
        exit /b 1
    )
)

if not exist "%RUNTIME_PYTHONW%" (
    echo.
    echo Setup finished but the Python runtime was still not found at:
    echo   %RUNTIME_PYTHONW%
    pause
    exit /b 1
)

if not exist "%SHELL_PY%" (
    echo Shell script not found:
    echo   %SHELL_PY%
    echo The extracted folder may be incomplete. Please re-download the ZIP.
    pause
    exit /b 1
)

start "" "%RUNTIME_PYTHONW%" "%SHELL_PY%"
exit /b 0
