$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'This installer test is restricted to a disposable GitHub Windows VM. Do not run on a user computer.' }
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'The isolated VM must already have administrator rights; do not request or bypass UAC.' }
$root = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP ('ChatQ-install-check-' + [guid]::NewGuid().ToString('N'))))
$allowed = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
if (-not $root.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected fixture directory' }
$clsid = '{748AD105-8033-4DC2-9B19-5E0A0AC011A1}'
$tipRoot = 'HKLM:\SOFTWARE\Microsoft\CTF\TIP'
$before = @(Get-ChildItem -LiteralPath $tipRoot | Select-Object -ExpandProperty PSChildName)
if ($before -contains $clsid) { throw 'This VM is not clean; preserve existing registration.' }
$data = Join-Path $env:LOCALAPPDATA 'ChatQWindows'
if (Test-Path -LiteralPath $data) { throw 'Preserve existing application data; installer fixture expects a clean VM.' }
New-Item -ItemType Directory -Path $data | Out-Null
$sentinel = Join-Path $data 'synthetic-installer-preservation.txt'
'Synthetic fixture data, no credentials or user text' | Set-Content -LiteralPath $sentinel -Encoding utf8
$installer = [IO.Path]::GetFullPath('out/ChatQ-Windows-0.1.1-x64-Setup.exe')
$previous = [IO.Path]::GetFullPath('out/upgrade/ChatQ-Windows-0.1.0-x64-Setup.exe')
if ((Get-FileHash -LiteralPath $previous -Algorithm SHA256).Hash -ne '1cf3c07761f132744c611001a11b36a2ca97f613a68745dd62de44ed8f2ba043') { throw 'Prior preview installer hash mismatch' }
$previousInstall = Start-Process -FilePath $previous -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/TYPE=full',('/DIR="' + $root + '"')) -Wait -PassThru -WindowStyle Hidden
if ($previousInstall.ExitCode -notin @(0,3010)) { throw 'Prior preview install failed' }
$installLog = Join-Path $env:RUNNER_TEMP 'chatq-installer-check.log'
$process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/TYPE=full',('/DIR="' + $root + '"'),('/LOG="' + $installLog + '"')) -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -notin @(0,3010)) { Get-Content -LiteralPath $installLog -Tail 60; throw "Installer failed: $($process.ExitCode)" }
if (-not (Test-Path -LiteralPath (Join-Path $root 'ChatQ.exe'))) { throw 'Desktop assistant not installed' }
foreach ($item in @(@('x64','Registry64'),@('x86','Registry32'))) {
    $view = [Microsoft.Win32.RegistryView]::$($item[1])
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,$view)
    $key = $base.OpenSubKey("Software\Classes\CLSID\$clsid\InprocServer32")
    try {
        $expected = Join-Path $root "ime\$($item[0])\ChatQTip.dll"
        if (-not $key -or $key.GetValue('') -ne $expected) { throw "COM path incorrect for $($item[0])" }
        if ((Get-FileHash -LiteralPath $expected -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath "out/$($item[0])/ChatQTip.dll" -Algorithm SHA256).Hash) { throw "Upgrade did not replace $($item[0]) DLL" }
    } finally { if ($key) { $key.Dispose() }; $base.Dispose() }
    $profileKey = "HKLM:\SOFTWARE\Microsoft\CTF\TIP\$clsid\LanguageProfile\0x00000804\{A8507AE6-64E4-4A6B-A45D-0FD6F0A55310}"
    Write-Host "Installed $($item[0]) COM path verified; persistent Chinese profile: $(Test-Path -LiteralPath $profileKey)"
    $buildName = if ($item[0] -eq 'x64') { 'native-x64' } else { 'native-x86' }
    New-Item -ItemType Directory -Force out/validation | Out-Null
    $checkOutput = [IO.Path]::GetFullPath("out/validation/$($item[0])-tsf.log")
    $checkError = [IO.Path]::GetFullPath("out/validation/$($item[0])-tsf-error.log")
    $check = Start-Process -FilePath "out/$buildName/Release/ChatQTsfChecks.exe" -ArgumentList @(('"' + (Join-Path $root "ime\$($item[0])\ChatQTip.dll") + '"'),'--registered') -RedirectStandardOutput $checkOutput -RedirectStandardError $checkError -PassThru -WindowStyle Hidden
    if (-not $check.WaitForExit(60000)) { $check.Kill(); throw "Isolated TSF check timed out for $($item[0])" }
    Get-Content -LiteralPath $checkOutput,$checkError
    if ($check.ExitCode) { throw "Installed TSF check failed for $($item[0])" }
}
$uninstaller = Join-Path $root 'unins000.exe'
$uninstallLog = Join-Path $env:RUNNER_TEMP 'chatq-uninstaller-check.log'
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="' + $uninstallLog + '"')) -Wait -PassThru -WindowStyle Hidden
if ($uninstall.ExitCode -notin @(0,3010)) { throw "Uninstaller failed: $($uninstall.ExitCode)" }
if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Uninstall deleted application data' }
$after = @(Get-ChildItem -LiteralPath $tipRoot | Select-Object -ExpandProperty PSChildName)
if ($after -contains $clsid) { Get-Content -LiteralPath $uninstallLog -Tail 45; throw 'Project TSF profile remains after uninstall' }
if (@(Compare-Object $before $after).Count -ne 0) { throw 'Other input-method registration changed' }
foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,$view)
    $key = $base.OpenSubKey("Software\Classes\CLSID\$clsid")
    try { if ($key) { throw 'Project COM class remains after uninstall' } }
    finally { if ($key) { $key.Dispose() }; $base.Dispose() }
}
New-Item -ItemType Directory -Force out/validation | Out-Null
[ordered]@{ status='passed'; environment='disposable GitHub Windows VM'; previousVersion='0.1.0'; previousInstallerExit=$previousInstall.ExitCode; upgradeAndBinaryReplacementPassed=$true; installerExit=$process.ExitCode; uninstallerExit=$uninstall.ExitCode; x64AndX86RegisteredComAndTsfPassed=$true; userDataPreserved=$true; otherInputMethodRegistrationsPreserved=$true; visibleAssistantLaunched=$false; wechatQqValidated=$false; paidAiCalls=0 } | ConvertTo-Json | Set-Content -LiteralPath 'out/validation/installer-smoke.json' -Encoding utf8
# Delete only the known synthetic marker. Never recursively remove a user-data directory.
Remove-Item -LiteralPath $sentinel
if (@(Get-ChildItem -LiteralPath $data -Force).Count -eq 0) { [IO.Directory]::Delete($data,$false) }
