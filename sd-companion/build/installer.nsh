!macro customInstallMode
  StrCpy $isForceCurrentInstall 1
!macroend

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync MyTasks"
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "C:\SD Apps\StudioSync MyTasks"
!macroend
