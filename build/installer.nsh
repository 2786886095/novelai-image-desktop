; Keep electron-builder process handling intact when adding our pre-uninstall guard.
!include "getProcessInfo.nsh"
Var pid
; Keep this guard in the install section, after the normal running-app check
; and BEFORE electron-builder invokes any old uninstaller. customInstall is too late.
!macro checkUserOutputLocation DIRECTORY
  ${If} "${DIRECTORY}" != ""
    nsExec::ExecToStack /TIMEOUT=45000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\protect-update-data.ps1" -InstallDir "${DIRECTORY}"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      ; Do not use /SD: even a silent update must explain why it stopped.
      MessageBox MB_OK|MB_ICONSTOP "更新已停止，旧软件与图片未删除。$\r$\n检测到安装目录内的用户数据，或数据检查未完成。$\r$\n请先将图片复制到安装目录以外并核对完整，在软件设置中修改保存目录后重试。$\r$\n$\r$\n$1"
      SetErrorLevel 20
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro inspectOutputLocations
  Push $0
  Push $1
  Push $2
  !insertmacro checkUserOutputLocation "$INSTDIR"
  ; /D or an assisted install can select a different destination. The old
  ; registered location is still removed by electron-builder, so inspect it too.
  ReadRegStr $2 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro checkUserOutputLocation "$2"
  ReadRegStr $2 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro checkUserOutputLocation "$2"
  Pop $2
  Pop $1
  Pop $0
!macroend

; Also run in .onInit: elevated inner installers skip CHECK_APP_RUNNING.
!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\protect-update-data.ps1 "${BUILD_RESOURCES_DIR}\protect-update-data.ps1"
  !insertmacro inspectOutputLocations
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ; Runs after the application exits, before uninstallOldVersion. No copies or deletes.
    ClearErrors
    !insertmacro inspectOutputLocations
  !endif
!macroend
