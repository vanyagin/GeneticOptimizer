@echo off
chcp 65001 >nul
title Оптимизатор функций — НЕ закрывайте это окно, пока работаете
cd /d "%~dp0"

if not exist "%~dp0python\python.exe" goto nopython

echo Запуск оптимизатора функций...
echo Браузер откроется сам. Чтобы выйти — закройте это окно.
echo.
"%~dp0python\python.exe" "%~dp0app.py"
echo.
echo Работа завершена.
pause
exit /b 0

:nopython
echo =====================================================
echo  Встроенный Python не найден.
echo  Сначала нужно СОБРАТЬ приложение:
echo  откройте папку installer и запустите файл build.bat
echo  Он скачает Python и подготовит запуск.
echo =====================================================
echo.
pause
exit /b 1
