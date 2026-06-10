@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Сборка — Оптимизатор функций
cd /d "%~dp0"

set "PYVER=3.11.9"
set "PYZIP=python-%PYVER%-embed-amd64.zip"
set "PYURL=https://www.python.org/ftp/python/%PYVER%/%PYZIP%"
set "PYDIR=%~dp0payload\python"

echo ==================================================
echo   Сборка приложения "Оптимизатор функций"
echo ==================================================
echo.

REM --- Шаг 1: встроенный Python ---
if exist "%PYDIR%\python.exe" (
  echo [1/4] Python уже на месте, загрузка не нужна.
) else (
  echo [1/4] Скачиваю встроенный Python %PYVER% с python.org ...
  if exist "%TEMP%\%PYZIP%" del "%TEMP%\%PYZIP%"
  curl -L -o "%TEMP%\%PYZIP%" "%PYURL%"
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось скачать Python. Проверьте интернет и повторите.
    pause & exit /b 1
  )
  echo        Распаковываю...
  if exist "%PYDIR%" rmdir /s /q "%PYDIR%"
  mkdir "%PYDIR%"
  tar -xf "%TEMP%\%PYZIP%" -C "%PYDIR%"
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось распаковать архив Python.
    pause & exit /b 1
  )
)

REM --- Шаг 2: пути Python (._pth) ---
echo [2/4] Настраиваю окружение Python...
set "PTH=%PYDIR%\python311._pth"
> "%PTH%" echo python311.zip
>>"%PTH%" echo .
>>"%PTH%" echo ..
>>"%PTH%" echo ..\pylib
>>"%PTH%" echo import site

REM --- Шаг 3: поиск NSIS ---
echo [3/4] Ищу NSIS (makensis)...
set "MAKENSIS="
for /f "delims=" %%i in ('where makensis 2^>nul') do set "MAKENSIS=%%i"
if not defined MAKENSIS if exist "%ProgramFiles(x86)%\NSIS\makensis.exe" set "MAKENSIS=%ProgramFiles(x86)%\NSIS\makensis.exe"
if not defined MAKENSIS if exist "%ProgramFiles%\NSIS\makensis.exe" set "MAKENSIS=%ProgramFiles%\NSIS\makensis.exe"

if not defined MAKENSIS (
  echo.
  echo [ВНИМАНИЕ] NSIS не найден - .exe-установщик собрать нельзя.
  echo Соберу только портативную версию ^(папка + zip^) - её достаточно для запуска.
  echo Чтобы получить установщик: поставьте NSIS с https://nsis.sourceforge.io
  echo и запустите этот файл ещё раз.
  goto :portable
)

REM --- Шаг 4: сборка установщика ---
echo [4/4] Собираю установщик через NSIS...
"%MAKENSIS%" /INPUTCHARSET UTF8 installer.nsi
if errorlevel 1 (
  echo [ОШИБКА] Сборка установщика не удалась, делаю портативную версию.
  goto :portable
)
echo.
echo ГОТОВО: установщик GeneticOptimizer-Setup.exe собран.

:portable
echo.
echo Собираю портативную версию...
set "PORT=%~dp0GeneticOptimizer-portable"
if exist "%PORT%" rmdir /s /q "%PORT%"
mkdir "%PORT%"
xcopy /e /i /y /q "%~dp0payload\*" "%PORT%\" >nul
if exist "%~dp0GeneticOptimizer-portable.zip" del "%~dp0GeneticOptimizer-portable.zip"
powershell -NoProfile -Command "Compress-Archive -Path '%PORT%\*' -DestinationPath '%~dp0GeneticOptimizer-portable.zip' -Force"
echo ГОТОВО: GeneticOptimizer-portable.zip ^(распаковать и запустить "run.bat"^)

echo.
echo ==================================================
echo   Сборка завершена. Файлы рядом с этим скриптом.
echo ==================================================
pause
