param([Parameter(Mandatory=$true)][string]$Script,[hashtable]$Parameters=@{})
$ErrorActionPreference='Stop'
# The child script runs with private variables scoped here; nothing returns credentials.
$root=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ChatQSigning/android-production'
$recordFile=Join-Path $root 'credentials.dpapi';$publicFile=Join-Path $root 'signer.json'
if(!(Test-Path -LiteralPath $recordFile)-or!(Test-Path -LiteralPath $publicFile)){throw 'Prepare the dedicated Android signing key first'}
foreach($p in @($root,$recordFile,$publicFile)){if((Get-Item -LiteralPath $p).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Signing paths cannot be links'}}
$plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($recordFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$names=@('CHATQ_ANDROID_EDITION','CHATQ_ANDROID_STORE_FILE','CHATQ_ANDROID_STORE_PASSWORD','CHATQ_ANDROID_KEY_ALIAS','CHATQ_ANDROID_KEY_PASSWORD','CHATQ_ANDROID_SIGNER_SHA256');$previous=@{}
foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
    $record=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json;$metadata=Get-Content -LiteralPath $publicFile -Raw|ConvertFrom-Json
    if($record.schema-ne 1-or$metadata.schema-ne 1-or$metadata.sha256-notmatch '^[a-f0-9]{64}$'-or$record.keyAlias-ne 'chatq-release'){throw 'Signing metadata is not valid'}
    if([IO.Path]::GetFullPath($record.storeFile)-ne[IO.Path]::GetFullPath((Join-Path $root 'chatq-release.jks'))){throw 'Unexpected signing keystore path'}
    if(!(Test-Path -LiteralPath $record.storeFile)-or((Get-Item -LiteralPath $record.storeFile).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Dedicated signing keystore unavailable'}
    $env:CHATQ_ANDROID_EDITION='production';$env:CHATQ_ANDROID_STORE_FILE=$record.storeFile;$env:CHATQ_ANDROID_STORE_PASSWORD=$record.storePassword;$env:CHATQ_ANDROID_KEY_ALIAS=$record.keyAlias;$env:CHATQ_ANDROID_KEY_PASSWORD=$record.keyPassword;$env:CHATQ_ANDROID_SIGNER_SHA256=$metadata.sha256
    if(![IO.Path]::IsPathFullyQualified($Script)-or!(Test-Path -LiteralPath $Script)-or[IO.Path]::GetExtension($Script)-ine'.ps1'-or((Get-Item -LiteralPath $Script).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Use an explicitly selected trusted PowerShell build/check script'}
    & $Script @Parameters
    if($LASTEXITCODE){throw 'Signed build/check command failed'}
}finally{
    foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}
    [Security.Cryptography.CryptographicOperations]::ZeroMemory($plain);$record=$null
}
