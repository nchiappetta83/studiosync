!include "getProcessInfo.nsh"

Var pid
Var IsPowerShellAvailable

!macro customCheckAppRunning
  # The default PowerShell check matches every executable below a path prefix.
  # Use electron-builder's exact image-name fallback so MyTasks stays open.
  StrCpy $IsPowerShellAvailable 1
  !insertmacro _CHECK_APP_RUNNING
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall 1
!macroend

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync"
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\StudioSync.lnk" "$INSTDIR\StudioSync.exe" "" "$INSTDIR\resources\studiosync-main.ico" 0
!macroend
