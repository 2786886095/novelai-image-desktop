; Keep electron-builder process handling intact when adding our pre-uninstall guard.
!include "getProcessInfo.nsh"
!include "LogicLib.nsh"
Var pid
!ifndef BUILD_UNINSTALLER
Var stageLegacyRuntime
Var installCompleted
!endif
; Keep this guard in the install section, after the normal running-app check
; and BEFORE electron-builder invokes any old uninstaller. customInstall is too late.
!macro checkUserOutputLocation DIRECTORY
  ${If} "${DIRECTORY}" != ""
    DetailPrint "正在备份并校验酒馆数据，请稍候……"
    ; .onInit runs before the installer progress page exists, even in visible mode.
    Banner::show /NOUNLOAD "正在更新：检查并备份酒馆数据，请稍候……"
    nsExec::ExecToStack /TIMEOUT=300000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\protect-update-data.ps1" -InstallDir "${DIRECTORY}" -MigrateWorkspace -ExecutableName "${APP_EXECUTABLE_FILENAME}"'
    Pop $0
    Pop $1
    Banner::destroy
    ${If} $0 != 0
      ; Do not use /SD: even a silent update must explain why it stopped.
      MessageBox MB_OK|MB_ICONSTOP "更新已停止，旧软件与数据未删除。$\r$\n酒馆会自动备份到应用数据目录，校验成功才继续安装。若旧版仍开着，请先关闭后重试。$\r$\n图片输出目录位于安装目录内时，仍需先保留图片并修改保存位置。$\r$\n$\r$\n$1"
      SetErrorLevel 20
      Quit
    ${EndIf}
    ${If} $stageLegacyRuntime == "1"
      nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stage-legacy-runtime.ps1" -Operation Stage -Ledger "$PLUGINSDIR\legacy-runtime.json" -InstallDir "${DIRECTORY}"'
      Pop $0
      Pop $1
      ${If} $0 != 0
        MessageBox MB_OK|MB_ICONSTOP "更新已停止，旧运行环境已保留。$\r$\n$1"
        nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stage-legacy-runtime.ps1" -Operation Restore -Ledger "$PLUGINSDIR\legacy-runtime.json"'
        Pop $0
        Pop $1
        SetErrorLevel 22
        Quit
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro inspectOutputLocations
  Push $0
  Push $1
  Push $2
  Push $3
  !insertmacro checkUserOutputLocation "$INSTDIR"
  ; /D or an assisted install can select a different destination. The old
  ; registered location is still removed by electron-builder, so inspect it too.
  ReadRegStr $2 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $2 != $INSTDIR
    !insertmacro checkUserOutputLocation "$2"
  ${EndIf}
  ReadRegStr $3 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $3 != $INSTDIR
  ${AndIf} $3 != $2
    !insertmacro checkUserOutputLocation "$3"
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

; Also run in .onInit: elevated inner installers skip CHECK_APP_RUNNING.
!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\protect-update-data.ps1 "${BUILD_RESOURCES_DIR}\protect-update-data.ps1"
  File /oname=$PLUGINSDIR\backup-agent-workspace.ps1 "${BUILD_RESOURCES_DIR}\backup-agent-workspace.ps1"
  File /oname=$PLUGINSDIR\stage-legacy-runtime.ps1 "${BUILD_RESOURCES_DIR}\stage-legacy-runtime.ps1"
  ; Elevated inner instances skip the normal section check; the outer installer
  ; already waited for app exit before launching them.
  ${If} ${UAC_IsInnerInstance}
    StrCpy $stageLegacyRuntime "1"
  ${EndIf}
  !insertmacro inspectOutputLocations
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ; Recheck after application exit, before uninstallOldVersion; verified copies only.
    ClearErrors
    StrCpy $stageLegacyRuntime "1"
    !insertmacro inspectOutputLocations
  !endif
!macroend

!macro customInstall
  StrCpy $installCompleted "1"
  nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stage-legacy-runtime.ps1" -Operation Commit -Ledger "$PLUGINSDIR\legacy-runtime.json"'
  Pop $0
  Pop $1
  DetailPrint "$1"
!macroend

; Also runs on cancellation/failure. Do not overwrite a newly created source.
!ifndef BUILD_UNINSTALLER
Function .onInstFailed
  Call RestoreLegacyRuntime
FunctionEnd
Function .onGUIEnd
  Call RestoreLegacyRuntime
FunctionEnd
Function RestoreLegacyRuntime
  ${If} $installCompleted != "1"
  ${AndIf} $stageLegacyRuntime == "1"
    nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stage-legacy-runtime.ps1" -Operation Restore -Ledger "$PLUGINSDIR\legacy-runtime.json"'
    Pop $0
    Pop $1
  ${EndIf}
FunctionEnd
!endif
