!macro customInstallMode
  StrCpy $isForceCurrentInstall 1
!macroend

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync Personal"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync Personal"
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\StudioSync Personal.lnk" "$INSTDIR\StudioSync Personal.exe" "" "$INSTDIR\StudioSync Personal.exe" 0
!macroend
