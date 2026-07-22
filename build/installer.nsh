!macro customInit
  ; Versions before 1.4.3 stored generated images inside the NSIS install
  ; directory. electron-updater replaces that directory, so rescue the legacy
  ; files before the old installation is removed. The new app remaps persisted
  ; history paths to this Pictures folder on first launch.
  IfFileExists "$INSTDIR\outputs\*.*" 0 done_protecting_outputs
  ; Move the complete directory first so nested date/group folders survive and
  ; existing Pictures files are never overwritten. The new app copies this
  ; recovery folder into its safe default location on first launch.
  CreateDirectory "$PICTURES"
  Rename "$INSTDIR\outputs" "$PICTURES\Langbai NovelAI Studio Update Backup"
  IfErrors backup_already_exists
  SetFileAttributes "$PICTURES\Langbai NovelAI Studio Update Backup" HIDDEN
  Goto done_protecting_outputs
  ; A previous interrupted update may have left the backup directory behind.
  ; Keep the old install untouched rather than deleting either copy.
  backup_already_exists:
  CreateDirectory "$PICTURES\Langbai NovelAI Studio Update Backup"
  SetFileAttributes "$PICTURES\Langbai NovelAI Studio Update Backup" HIDDEN
  CopyFiles /SILENT "$INSTDIR\outputs\*.*" "$PICTURES\Langbai NovelAI Studio Update Backup"
  done_protecting_outputs:
!macroend
