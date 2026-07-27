; Sasist Agent — Inno Setup 6
; Build: ISCC.exe installer\SasistAgent.iss  (after scripts\publish-release.ps1)
;
; Upgrade-safe: stops service + kills Tray/Host BEFORE file copy (avoids DeleteFile code 5).

#define MyAppName "Sasist Agent"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Sasist"
#define MyAppExeName "Sasist.Agent.Tray.exe"
#define MyServiceExe "Sasist.Agent.Host.exe"
#define MyServiceName "SasistAgent"
#define PublishDir "..\publish\win-x64"

[Setup]
AppId={{A8F3C2E1-9B47-4D6A-8E21-5C0A1B2D3E4F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Sasist\Agent
DefaultGroupName=Sasist Agent
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=SasistAgentSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SetupIconFile=..\assets\sasist-agent.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}.0
VersionInfoProductName={#MyAppName}
CloseApplications=force
CloseApplicationsFilter=Sasist.Agent.*.exe,SasistPrinter*.exe
RestartApplications=no
UsePreviousAppDir=yes

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Utwórz skrót na pulpicie"; GroupDescription: "Dodatkowe skróty:"; Flags: unchecked
Name: "autostart"; Description: "Uruchamiaj Sasist Agent przy logowaniu"; GroupDescription: "Autostart:"; Flags: checkedonce

[Dirs]
Name: "{commonappdata}\Sasist\Agent"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\logs"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\temp"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\secrets"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\plugins"; Permissions: users-modify

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs restartreplace uninsrestartdelete
Source: "..\config\config.default.json"; DestDir: "{commonappdata}\Sasist\Agent"; DestName: "config.json"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-modify

[Icons]
Name: "{group}\Sasist Agent"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Odinstaluj Sasist Agent"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Sasist Agent"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SasistAgentTray"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{sys}\sc.exe"; Parameters: "create {#MyServiceName} binPath= ""{app}\{#MyServiceExe}"" start= auto DisplayName= ""Sasist Agent"""; Flags: runhidden waituntilterminated; StatusMsg: "Instalacja usługi…"; Check: not ServiceExists
Filename: "{sys}\sc.exe"; Parameters: "config {#MyServiceName} binPath= ""{app}\{#MyServiceExe}"" start= auto DisplayName= ""Sasist Agent"""; Flags: runhidden waituntilterminated; StatusMsg: "Aktualizacja usługi…"; Check: ServiceExists
Filename: "{sys}\sc.exe"; Parameters: "description {#MyServiceName} ""Sasist Agent — drukowanie z Sasist"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure {#MyServiceName} reset= 60 actions= restart/5000/restart/10000/restart/30000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Uruchamianie usługi…"
Filename: "{app}\{#MyAppExeName}"; Description: "Uruchom Sasist Agent"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{cmd}"; Parameters: "/C taskkill /F /IM Sasist.Agent.Tray.exe /T >nul 2>&1"; Flags: runhidden waituntilterminated; RunOnceId: "KillTray"
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "DelSvc"

[Code]
function ServiceExists(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function LegacyPrinterServiceExists(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query SasistPrinterService', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

procedure StopAndKillRunningAgent;
var
  ResultCode: Integer;
begin
  { Stop new service }
  if ServiceExists() then
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1500);
  end;

  { Stop legacy Python printer agent if still present }
  if LegacyPrinterServiceExists() then
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop SasistPrinterService', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);
  end;

  { Kill UI / host processes holding files (fixes DeleteFile code 5 on upgrade) }
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM Sasist.Agent.Tray.exe /T >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM Sasist.Agent.Host.exe /T >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM SasistPrinterAgent.exe /T >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM SasistPrinterService.exe /T >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(800);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  NeedsRestart := False;
  StopAndKillRunningAgent();
  Result := '';
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DataRoot: String;
begin
  if CurStep = ssInstall then
    StopAndKillRunningAgent();

  if CurStep = ssPostInstall then
  begin
    DataRoot := ExpandConstant('{commonappdata}\Sasist\Agent');
    ForceDirectories(DataRoot);
    ForceDirectories(DataRoot + '\logs');
    ForceDirectories(DataRoot + '\temp');
    ForceDirectories(DataRoot + '\secrets');
    ForceDirectories(DataRoot + '\plugins');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    StopAndKillRunningAgent();
end;
