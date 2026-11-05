; Rappespalter's Windows installer pages (electron-builder `nsis.include`).
;
; Welcome → install → finish, nothing to choose: it installs for the current user
; into the default folder, as the one-click installer did. The sidebar writes the
; name out like the app's loading page (frames from scripts/make-installer-art.mjs,
; built into build/installer by `pnpm dist`), and the finish page's "Let's go!"
; opens the app. Updates run this silently (/S --updated), so none of it shows then.

!include "${PROJECT_DIR}\build\installer\frames.nsh"

!ifndef BUILD_UNINSTALLER

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

ReserveFile "${PROJECT_DIR}\build\installer\frames\*.bmp"

; No "only for me / for all users" page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; ── The sidebar animation ────────────────────────────────────────────────────
; A timer swaps the welcome/finish page's image for the next frame until the last.

Var rpImage   ; the page's image control
Var rpBitmap  ; the frame on it now
Var rpFrame
Var rpFramesReady

Function rpPlay
  ${If} $rpFramesReady != "1"
    InitPluginsDir
    SetOutPath "$PLUGINSDIR\rp"
    File "${PROJECT_DIR}\build\installer\frames\*.bmp"
    StrCpy $rpFramesReady "1"
  ${EndIf}
  StrCpy $rpFrame 0
  StrCpy $rpBitmap 0
  ${NSD_CreateTimer} rpTick ${RP_FRAME_MS}
FunctionEnd

Function rpTick
  IntOp $rpFrame $rpFrame + 1
  ${If} $rpFrame > ${RP_LAST_FRAME}
    ${NSD_KillTimer} rpTick
    Return
  ${EndIf}
  StrCpy $0 $rpBitmap
  ${NSD_SetStretchedImage} $rpImage "$PLUGINSDIR\rp\f$rpFrame.bmp" $rpBitmap
  ${NSD_FreeImage} $0
FunctionEnd

Function rpStop
  ${NSD_KillTimer} rpTick
FunctionEnd

; ── Pages ────────────────────────────────────────────────────────────────────

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "$(rpWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(rpWelcomeText)"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW rpWelcomeShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE rpStop
  !insertmacro MUI_PAGE_WELCOME

  Function rpWelcomeShow
    StrCpy $rpImage $mui.WelcomePage.Image
    Call rpPlay
  FunctionEnd
!macroend

; "Let's go!" instead of a "Run Rappespalter" checkbox: finishing opens the app.
!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "$(rpFinishTitle)"
  !define MUI_FINISHPAGE_TEXT "$(rpFinishText)"
  !define MUI_FINISHPAGE_BUTTON "$(rpLetsGo)"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW rpFinishShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE rpFinishLeave
  !insertmacro MUI_PAGE_FINISH

  Function rpFinishShow
    StrCpy $rpImage $mui.FinishPage.Image
    Call rpPlay
  FunctionEnd

  Function rpFinishLeave
    Call rpStop
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
!macroend

; ── Words (after the languages are loaded) ──────────────────────────────────
; The app's own tone: "du"/"tu", and its first-start setup's "Let's go".

!macro customHeader
  LangString rpWelcomeTitle ${LANG_ENGLISH} "Welcome to Rappespalter"
  LangString rpWelcomeText  ${LANG_ENGLISH} "Your money, on your computer. Rappespalter keeps your finances in a file only you have: no account, no cloud.$\r$\n$\r$\nInstalling takes a few seconds."
  LangString rpFinishTitle  ${LANG_ENGLISH} "All set!"
  LangString rpFinishText   ${LANG_ENGLISH} "Rappespalter is installed. You'll find it in the Start menu and on your desktop."
  LangString rpLetsGo       ${LANG_ENGLISH} "Let's go!"

  LangString rpWelcomeTitle ${LANG_GERMAN} "Willkommen bei Rappespalter"
  LangString rpWelcomeText  ${LANG_GERMAN} "Dein Geld, auf deinem Computer. Rappespalter speichert deine Finanzen in einer Datei, die nur du hast: kein Konto, keine Cloud.$\r$\n$\r$\nDie Installation dauert ein paar Sekunden."
  LangString rpFinishTitle  ${LANG_GERMAN} "Alles bereit!"
  LangString rpFinishText   ${LANG_GERMAN} "Rappespalter ist installiert. Du findest es im Startmenü und auf dem Desktop."
  LangString rpLetsGo       ${LANG_GERMAN} "Los geht's!"

  LangString rpWelcomeTitle ${LANG_FRENCH} "Bienvenue dans Rappespalter"
  LangString rpWelcomeText  ${LANG_FRENCH} "Ton argent, sur ton ordinateur. Rappespalter garde tes finances dans un fichier que toi seul as : pas de compte, pas de cloud.$\r$\n$\r$\nL'installation prend quelques secondes."
  LangString rpFinishTitle  ${LANG_FRENCH} "C'est prêt !"
  LangString rpFinishText   ${LANG_FRENCH} "Rappespalter est installé. Tu le trouveras dans le menu Démarrer et sur le bureau."
  LangString rpLetsGo       ${LANG_FRENCH} "C'est parti !"

  LangString rpWelcomeTitle ${LANG_ITALIAN} "Benvenuto in Rappespalter"
  LangString rpWelcomeText  ${LANG_ITALIAN} "I tuoi soldi, sul tuo computer. Rappespalter tiene le tue finanze in un file che hai solo tu: nessun account, nessun cloud.$\r$\n$\r$\nL'installazione richiede pochi secondi."
  LangString rpFinishTitle  ${LANG_ITALIAN} "Tutto pronto!"
  LangString rpFinishText   ${LANG_ITALIAN} "Rappespalter è installato. Lo trovi nel menu Start e sul desktop."
  LangString rpLetsGo       ${LANG_ITALIAN} "Si parte!"
!macroend

!endif
