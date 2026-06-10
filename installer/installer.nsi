Unicode true
!include "MUI2.nsh"

!define APPNAME      "Оптимизатор функций"
!define APPDIRNAME   "GeneticOptimizer"
!define APPVERSION   "1.0.0"
!define PUBLISHER    "Иван — дипломная работа"
!define LAUNCHER     "run.bat"
!define UNINSTKEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPDIRNAME}"

Name "${APPNAME}"
OutFile "GeneticOptimizer-Setup.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\${APPDIRNAME}"
InstallDirRegKey HKCU "Software\${APPDIRNAME}" "InstallDir"
SetCompressor /SOLID lzma
BrandingText "${APPNAME} v${APPVERSION}"

!define MUI_ICON   "payload/app.ico"
!define MUI_UNICON "payload/app.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${LAUNCHER}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить оптимизатор функций"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Russian"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "payload\*.*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${LAUNCHER}" "" "$INSTDIR\app.ico"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Удалить ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${LAUNCHER}" "" "$INSTDIR\app.ico"

  WriteRegStr HKCU "Software\${APPDIRNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion"  "${APPVERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon"     "$INSTDIR\app.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPDIRNAME}"
SectionEnd
