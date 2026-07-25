!ifndef BUILD_UNINSTALLER
  !include "LogicLib.nsh"
  !include "nsProcess.nsh"

  !define STUDIO_PROCESS_NAME "Codex Dream Skin Studio.exe"

  !macro customCheckAppRunning
    DetailPrint "Closing an earlier Codex Dream Skin Studio process..."
    ${nsProcess::CloseProcess} "${STUDIO_PROCESS_NAME}" $R0
    ${If} $R0 == 0
      Sleep 1500
    ${EndIf}

    ${nsProcess::FindProcess} "${STUDIO_PROCESS_NAME}" $R0
    ${If} $R0 == 0
      ${nsProcess::KillProcess} "${STUDIO_PROCESS_NAME}" $R0
      Sleep 750
    ${EndIf}

    ${nsProcess::FindProcess} "${STUDIO_PROCESS_NAME}" $R0
    ${If} $R0 == 0
      MessageBox MB_OK|MB_ICONSTOP "Codex Dream Skin Studio could not be restarted automatically. Setup has not changed the installed files."
      Abort
    ${EndIf}

    ${nsProcess::Unload}
  !macroend
!endif
