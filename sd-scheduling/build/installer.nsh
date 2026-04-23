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
  IfFileExists "$DESKTOP\StudioSync.lnk" +2 0
    CreateShortCut "$DESKTOP\StudioSync.lnk" "$INSTDIR\StudioSync.exe"
!macroend
