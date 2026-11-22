@echo off
setlocal
pushd "%~dp0" || exit /b 1
where python >nul 2>nul
if errorlevel 1 (
  echo Python is required to run this local preview.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8081/ in your browser while this window is open.
echo Writing studio login: http://127.0.0.1:8081/admin
python -u server.py
set "result=%errorlevel%"
if not "%result%"=="0" pause
popd
exit /b %result%
