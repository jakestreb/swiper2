@echo off
set LOGFILE=%USERPROFILE%\Desktop\health_check_log.txt

:: Note there should be a shortcut to this file in the startup folder
echo running job at %date% %time% >> "%LOGFILE%"
echo starting the health check loop in 30 minutes  >> "%LOGFILE%"

timeout /t 1800 /nobreak >nul

echo %date% %time% running health checks

:loop
echo running the web health check  >> "%LOGFILE%"
call "%~dp0scripts\web_health_check.bat"  >> "%LOGFILE%"

:loop
echo running the plex health check  >> "%LOGFILE%"
call "%~dp0scripts\plex_health_check.bat"  >> "%LOGFILE%"

:loop
echo running the swiper health check  >> "%LOGFILE%"
call "%~dp0scripts\swiper_health_check.bat"  >> "%LOGFILE%"

timeout /t 3600 /nobreak >nul

goto loop