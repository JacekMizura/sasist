; Sasist Printer Agent — Inno Setup (production)
; Run from repository root:
;   cd sasist-printer-agent
;   pyinstaller agent.spec
;   pyinstaller service.spec
;   pyinstaller updater.spec
;   cd ..
;   iscc installer\installer.iss

#ifndef MyAppVersion
  #error "MyAppVersion must be passed by build.ps1 via ISCC /DMyAppVersion=x.y.z"
#endif

#define MyAppName "Sasist Printer Agent"
#define MyAppPublisher "Sasist"
#define MyAppExeName "SasistPrinterAgent.exe"
#define ServiceExeName "SasistPrinterService.exe"
#define UpdaterExeName "SasistPrinterUpdater.exe"
#define AgentRoot "..\sasist-printer-agent"
#define DistRoot AgentRoot + "\dist"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Sasist\PrinterAgent
DefaultGroupName=Sasist Printer Agent
DisableProgramGroupPage=yes
OutputDir=..\Output
OutputBaseFilename=SasistPrinterAgent-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
SetupIconFile={#AgentRoot}\assets\icon.ico
UninstallDisplayIcon={app}\assets\icon.ico
WizardStyle=modern

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; PyInstaller one-file artifacts only — no .py sources
Source: "{#DistRoot}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DistRoot}\{#ServiceExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DistRoot}\{#UpdaterExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DistRoot}\build_info.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#AgentRoot}\config\config.example.json"; DestDir: "{app}\config"; Flags: ignoreversion
Source: "{#AgentRoot}\assets\icon.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "install.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion

[InstallDelete]
Type: files; Name: "{commondesktop}\Sasist Printer Logs.lnk"
Type: files; Name: "{commondesktop}\Sasist Printer Config.lnk"
Type: files; Name: "{group}\Logi drukowania.lnk"
Type: files; Name: "{group}\Konfiguracja.lnk"
Type: files; Name: "{group}\Sasist Printer Agent (Tray).lnk"

[Icons]
Name: "{group}\Sasist Printer Agent"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\icon.ico"
Name: "{commondesktop}\Sasist Printer Agent"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\icon.ico"

[Run]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\install.ps1"" -InstallDir ""{app}"""; \
  StatusMsg: "Konfiguracja usługi drukowania..."; \
  Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "sc.exe"; Parameters: "stop SasistPrinterService"; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{app}\{#ServiceExeName}"; Parameters: "remove"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

[Code]
const
  ServiceInternalName = 'SasistPrinterService';

procedure StopPrintingService();
var
  ResultCode: Integer;
begin
  if Exec('sc.exe', 'stop ' + ServiceInternalName, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Log('Requested service stop before file install (code ' + IntToStr(ResultCode) + ')')
  else
    Log('Service stop skipped or failed before install');
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  { Upgrade path: stop service before Inno overwrites binaries }
  StopPrintingService();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopPrintingService();
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    StopPrintingService();
end;
