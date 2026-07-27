; Sasist Agent — Inno Setup 6
; Build: ISCC.exe installer\SasistAgent.iss  (after scripts\publish-release.ps1)

#define MyAppName "Sasist Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Sasist"
#define MyAppExeName "Sasist.Agent.Tray.exe"
#define MyServiceExe "Sasist.Agent.Host.exe"
#define MyServiceName "SasistAgent"
#define PublishDir "..\publish\win-x64"

[Setup]
AppId={{A8F3C2E1-9B47-4D6A-8E21-5C0A1B2D3E4F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
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

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Utwórz skrót na pulpicie"; GroupDescription: "Dodatkowe skróty:"; Flags: unchecked
Name: "autostart"; Description: "Uruchamiaj Tray przy logowaniu"; GroupDescription: "Autostart:"; Flags: checkedonce

[Dirs]
Name: "{commonappdata}\Sasist\Agent"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\logs"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\temp"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\secrets"; Permissions: users-modify
Name: "{commonappdata}\Sasist\Agent\plugins"; Permissions: users-modify

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\config\config.default.json"; DestDir: "{commonappdata}\Sasist\Agent"; DestName: "config.json"; Flags: onlyifdoesntexist uninsneveruninstall; Permissions: users-modify

[Icons]
Name: "{group}\Sasist Agent"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Odinstaluj Sasist Agent"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Sasist Agent"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SasistAgentTray"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Utwórz / zaktualizuj usługę Windows i uruchom
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Zatrzymywanie usługi…"; Check: ServiceExists
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Usuwanie starej usługi…"; Check: ServiceExists
Filename: "{sys}\sc.exe"; Parameters: "create {#MyServiceName} binPath= ""{app}\{#MyServiceExe}"" start= auto DisplayName= ""Sasist Agent"""; Flags: runhidden waituntilterminated; StatusMsg: "Instalacja usługi…"
Filename: "{sys}\sc.exe"; Parameters: "description {#MyServiceName} ""Sasist Edge Agent — druk i urządzenia brzegowe"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure {#MyServiceName} reset= 60 actions= restart/5000/restart/10000/restart/30000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start {#MyServiceName}"; Flags: runhidden waituntilterminated; StatusMsg: "Uruchamianie usługi…"
Filename: "{app}\{#MyAppExeName}"; Description: "Uruchom Sasist Agent Tray"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "DelSvc"

[Code]
function ServiceExists(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DataRoot: String;
begin
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
