!include "getProcessInfo.nsh"

Var pid
Var IsPowerShellAvailable

!macro customCheckAppRunning
  # The default PowerShell check matches every executable below a path prefix.
  # Use electron-builder's exact image-name fallback so Dashboard stays open.
  StrCpy $IsPowerShellAvailable 1
  !insertmacro _CHECK_APP_RUNNING
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall 1
!macroend

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync MyTasks"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync MyTasks"
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\StudioSync MyTasks.lnk" "$INSTDIR\StudioSync MyTasks.exe" "" "$INSTDIR\resources\assets\studiosync-mytasks.ico" 0
  WinShell::SetLnkAUMI "$DESKTOP\StudioSync MyTasks.lnk" "${APP_ID}"
!macroend
