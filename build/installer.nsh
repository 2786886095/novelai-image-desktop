; Keep electron-builder process handling intact when adding our pre-uninstall guard.
!include "getProcessInfo.nsh"
Var pid
; Keep this guard in the install section, after the normal running-app check
; and BEFORE electron-builder invokes any old uninstaller. customInstall is too late.
!macro checkUserOutputLocation DIRECTORY
  ${If} "${DIRECTORY}" != ""
    DetailPrint "正在备份并校验酒馆数据，请稍候……"
    ${If} ${Silent}
      Banner::show /NOUNLOAD "正在更新：检查并备份酒馆数据，请稍候……"
    ${EndIf}
    nsExec::ExecToStack /TIMEOUT=300000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\protect-update-data.ps1" -InstallDir "${DIRECTORY}" -MigrateWorkspace -ExecutableName "${APP_EXECUTABLE_FILENAME}"'
    Pop $0
    Pop $1
    ${If} ${Silent}
      Banner::destroy
    ${EndIf}
    ${If} $0 != 0
      ; Do not use /SD: even a silent update must explain why it stopped.
      MessageBox MB_OK|MB_ICONSTOP "更新已停止，旧软件与数据未删除。$\r$\n酒馆会自动备份到应用数据目录，校验成功才继续安装。若旧版仍开着，请先关闭后重试。$\r$\n图片输出目录位于安装目录内时，仍需先保留图片并修改保存位置。$\r$\n$\r$\n$1"
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
  File /oname=$PLUGINSDIR\backup-agent-workspace.ps1 "${BUILD_RESOURCES_DIR}\backup-agent-workspace.ps1"
  !insertmacro inspectOutputLocations
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ; Recheck after application exit, before uninstallOldVersion; verified copies only.
    ClearErrors
    !insertmacro inspectOutputLocations
  !endif
!macroend
