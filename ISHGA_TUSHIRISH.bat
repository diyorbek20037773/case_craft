@echo off
setlocal
chcp 65001 >nul
title CaseCraft - ishga tushirish
cd /d "%~dp0"
set "ROOT=%~dp0"

rem Portlar (sinov uchun o'zgartirish mumkin: set CC_BACK_PORT=8020 ...)
if not defined CC_BACK_PORT set "CC_BACK_PORT=8000"
if not defined CC_FRONT_PORT set "CC_FRONT_PORT=5173"
rem CC_NO_BROWSER=1 bo'lsa brauzer ochilmaydi (sinov uchun)

echo.
echo ==========================================
echo   CaseCraft - sud trenajyori
echo ==========================================
echo.

rem ---------- 1. Python 3.11+ ----------
set "PY="
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1 && set "PY=python"
if not defined PY (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1 && set "PY=py -3"
)
if not defined PY goto :no_python
echo [OK] Python topildi.

rem ---------- 2. Node.js 20+ ----------
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)" >nul 2>&1
if errorlevel 1 goto :no_node
echo [OK] Node.js topildi.

rem ---------- 3. server\.env ----------
if exist "server\.env" goto :env_ok
copy /y "server\.env.example" "server\.env" >nul
echo.
echo ------------------------------------------------------------
echo  server\.env fayli yaratildi.
echo  Hozir Bloknot (Notepad) ochiladi. Quyidagi qatorni toping:
echo      GEMINI_API_KEY=
echo  va "=" belgisidan keyin Gemini kalitini qo'ying, masalan:
echo      GEMINI_API_KEY=AIza......
echo  Faylni saqlang (Ctrl+S), Bloknotni yoping va
echo  ISHGA_TUSHIRISH.bat ni yana ikki marta bosing.
echo.
echo  Kalit bo'lmasa ham ishlaydi, lekin AI javoblari
echo  tayyor (mock) matnlar bilan almashtiriladi.
echo ------------------------------------------------------------
echo.
start "" notepad "%ROOT%server\.env"
pause
exit /b 0

:env_ok
findstr /r /c:"^GEMINI_API_KEY=..*" "server\.env" >nul 2>&1
if errorlevel 1 (
  echo [!] server\.env da GEMINI_API_KEY bo'sh - AI o'rniga mock javoblar ishlaydi.
) else (
  echo [OK] server\.env topildi, Gemini kaliti bor.
)

rem ---------- 4. Python kutubxonalari (faqat birinchi marta) ----------
rem venv qisqa yo'lda turadi: ba'zi paketlarda fayl yo'li juda uzun (Windows 260 belgi chegarasi)
if not defined CC_VENV if defined LOCALAPPDATA set "CC_VENV=%LOCALAPPDATA%\CaseCraft\venv"
if not defined CC_VENV set "CC_VENV=%ROOT%server\.venv"
set "VPY=%CC_VENV%\Scripts\python.exe"
if exist "%CC_VENV%\.deps_ok" goto :py_ok
echo.
echo [..] Python kutubxonalari o'rnatilmoqda (birinchi marta, 2-6 daqiqa)...
echo      Joyi: %CC_VENV%
if exist "%VPY%" goto :venv_ok
%PY% -m venv "%CC_VENV%"
if errorlevel 1 goto :venv_fail
:venv_ok
"%VPY%" -m pip install --disable-pip-version-check -r "server\requirements.txt"
if errorlevel 1 goto :pip_fail
echo ok> "%CC_VENV%\.deps_ok"
:py_ok
echo [OK] Python kutubxonalari tayyor.

rem ---------- 5. Frontend kutubxonalari (faqat birinchi marta) ----------
if exist "web\node_modules\.bin\vite.cmd" goto :npm_ok
echo.
echo [..] Frontend kutubxonalari o'rnatilmoqda (birinchi marta, 2-5 daqiqa)...
pushd "web"
call npm install --no-fund --no-audit
set "NPM_ERR=%errorlevel%"
popd
if not "%NPM_ERR%"=="0" goto :npm_fail
:npm_ok
echo [OK] Frontend kutubxonalari tayyor.

rem ---------- 6. Backend ----------
echo.
netstat -ano | findstr /r /c:":%CC_BACK_PORT% .*LISTENING" >nul
if errorlevel 1 (
  echo [..] Backend ishga tushmoqda: http://localhost:%CC_BACK_PORT%
  start "CaseCraft backend (yopmang)" /D "%ROOT%server" cmd /k ""%VPY%" -m uvicorn app.main:app --port %CC_BACK_PORT%"
) else (
  echo [!] %CC_BACK_PORT%-port band. CaseCraft backend allaqachon ishlayotgan bo'lishi mumkin.
  echo     Agar ishlamasa: shu portni egallagan dasturni yoping va qayta urinib ko'ring.
)

rem ---------- 7. Frontend ----------
rem Standart: tayyor build (siqilgan, yengil) - npm run build + npm run preview. Har ishga tushirishda qayta build
rem qilinadi (kod yangilangan bo'lsa ham eskisi ochilmasin), 10-60 soniya. CC_DEV=1 - eski ishlab chiqish rejimi (npm run dev).
netstat -ano | findstr /r /c:":%CC_FRONT_PORT% .*LISTENING" >nul
if errorlevel 1 (
  if "%CC_DEV%"=="1" (
    echo [..] Frontend ishlab chiqish rejimida ishga tushmoqda: http://localhost:%CC_FRONT_PORT%
    start "CaseCraft frontend (yopmang)" /D "%ROOT%web" cmd /k "npm run dev -- --port %CC_FRONT_PORT% --strictPort"
  ) else (
    echo [..] Frontend tayyorlanmoqda ^(build, 10-60 soniya^), so'ng: http://localhost:%CC_FRONT_PORT%
    start "CaseCraft frontend (yopmang)" /D "%ROOT%web" cmd /k "npm run build && npm run preview -- --port %CC_FRONT_PORT% --strictPort"
  )
) else (
  echo [!] %CC_FRONT_PORT%-port band. Frontend allaqachon ishlayotgan bo'lishi mumkin.
)

rem ---------- 8. Kutish va brauzer ----------
echo [..] Sahifa tayyor bo'lishi kutilmoqda...
set /a TRIES=0
:wait_loop
set /a TRIES+=1
"%SystemRoot%\System32\curl.exe" -s -o nul -f "http://localhost:%CC_FRONT_PORT%/intro.html" >nul 2>&1
if not errorlevel 1 goto :ready
if %TRIES% geq 240 goto :ready
ping -n 2 127.0.0.1 >nul
goto :wait_loop
:ready
"%SystemRoot%\System32\curl.exe" -s -o nul -f "http://localhost:%CC_BACK_PORT%/health" >nul 2>&1
if errorlevel 1 echo [!] Backend hali javob bermayapti - "CaseCraft backend" oynasidagi xabarni o'qing.

if not "%CC_NO_BROWSER%"=="1" start "" "http://localhost:%CC_FRONT_PORT%/intro.html"

echo.
echo ==========================================
echo  CaseCraft ishga tushdi:
echo    Kirish:          http://localhost:%CC_FRONT_PORT%/intro.html
echo    Guvoh (3D zal):  http://localhost:%CC_FRONT_PORT%/guvoh.html
echo    O'qituvchi:      http://localhost:%CC_FRONT_PORT%/teacher.html  (PIN: 1234)
echo.
echo  To'xtatish: "CaseCraft backend" va "CaseCraft frontend"
echo  oynalarini yoping.
echo ==========================================
echo.
if "%CC_NO_BROWSER%"=="1" exit /b 0
pause
exit /b 0

rem ================= Xatolar =================
:no_python
echo.
echo [XATO] Python 3.11 yoki undan yangi versiya topilmadi.
echo   Yuklab oling: https://www.python.org/downloads/
echo   O'rnatishda "Add python.exe to PATH" belgisini albatta qo'ying!
echo   O'rnatgandan keyin shu faylni qayta ishga tushiring.
start "" "https://www.python.org/downloads/"
pause
exit /b 1

:no_node
echo.
echo [XATO] Node.js 20.19+ yoki 22.12+ topilmadi.
echo   Yuklab oling (LTS versiya): https://nodejs.org/
echo   O'rnatgandan keyin kompyuterni qayta yoqing yoki yangi oyna oching
echo   va shu faylni qayta ishga tushiring.
start "" "https://nodejs.org/"
pause
exit /b 1

:venv_fail
echo.
echo [XATO] Python virtual muhitini yaratib bo'lmadi: %CC_VENV%
echo   Python'ni qayta o'rnatib ko'ring: https://www.python.org/downloads/
pause
exit /b 1

:pip_fail
echo.
echo [XATO] Python kutubxonalarini o'rnatib bo'lmadi.
echo   Internet ulanishini tekshiring va qayta urinib ko'ring.
echo   Muammo davom etsa: %CC_VENV% papkasini o'chirib, qayta ishga tushiring.
pause
exit /b 1

:npm_fail
echo.
echo [XATO] npm install bajarilmadi.
echo   Internet ulanishini tekshiring. web\node_modules papkasini o'chirib,
echo   qayta ishga tushiring.
pause
exit /b 1
