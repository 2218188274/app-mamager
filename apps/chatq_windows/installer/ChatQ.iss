#define AppVersion "0.5.10"
[Setup]
AppId={{CFF07ED5-0636-44AF-AD28-2FEFC789DC23}
AppName=聊商 Windows
AppVersion={#AppVersion}
AppPublisher=ChatQ
SetupIconFile=..\Desktop\Brand.ico
DefaultDirName={autopf}\ChatQ
DefaultGroupName=聊商
OutputDir=..\out
OutputBaseFilename=ChatQ-Windows-0.5.10-x64-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.17763
PrivilegesRequired=admin
UninstallDisplayName=聊商 Windows（桌面助手与输入法）
UninstallDisplayIcon={app}\ChatQ.exe
CloseApplications=yes
RestartApplications=no
WizardStyle=modern
DisableProgramGroupPage=yes

[Languages]
Name: "chinesesimp"; MessagesFile: "ChineseSimplified.isl"
[Types]
Name: "full"; Description: "桌面助手和系统输入法（推荐）"
Name: "compact"; Description: "仅桌面 AI 助手"
Name: "custom"; Description: "自定义"; Flags: iscustom
[Components]
Name: "assistant"; Description: "聊商桌面 AI 助手"; Types: full compact custom; Flags: fixed
Name: "ime"; Description: "聊商拼音系统输入法（x64 与 x86）"; Types: full
[Files]
Source: "..\out\assistant\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb"; Components: assistant
Source: "..\out\x64\ChatQTip.dll"; DestDir: "{app}\ime\x64"; Flags: regserver 64bit restartreplace uninsrestartdelete; Components: ime
Source: "..\out\x86\ChatQTip.dll"; DestDir: "{app}\ime\x86"; Flags: regserver 32bit restartreplace uninsrestartdelete; Components: ime
Source: "..\out\x64\dict_pinyin.dat"; DestDir: "{app}\ime\x64"; Flags: ignoreversion; Components: ime
Source: "..\out\x86\dict_pinyin.dat"; DestDir: "{app}\ime\x86"; Flags: ignoreversion; Components: ime
Source: "..\..\chatq_keyboard\modules\chatq-keyboard\vendor\pinyin\NOTICE"; DestDir: "{app}\licenses"; DestName: "pinyin-NOTICE.txt"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "INNO-LICENSE.txt"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "THIRD-PARTY.md"; DestDir: "{app}\licenses"; DestName: "installer-translation-NOTICE.md"; Flags: ignoreversion
[Registry]
Root: HKLM; Subkey: "Software\ChatQWindows"; ValueType: string; ValueName: "AssistantPath"; ValueData: "{app}\ChatQ.exe"; Flags: uninsdeletevalue uninsdeletekeyifempty
[Icons]
Name: "{group}\聊商"; Filename: "{app}\ChatQ.exe"
Name: "{autodesktop}\聊商"; Filename: "{app}\ChatQ.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; Flags: checkedonce
[Run]
Filename: "{app}\ChatQ.exe"; Description: "打开聊商"; Flags: nowait postinstall skipifsilent
