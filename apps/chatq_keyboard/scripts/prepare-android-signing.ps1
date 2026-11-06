param([Parameter(Mandatory=$true)][string]$Keytool,[switch]$Initialize)
$ErrorActionPreference='Stop'
$taskBase=[IO.Path]::GetFullPath([Environment]::GetFolderPath('LocalApplicationData'))
$taskDirectory=[IO.Path]::GetFullPath((Join-Path $taskBase 'ChatQSigning/android-production'))
if(!$taskDirectory.StartsWith($taskBase+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected private signing directory'}
foreach($p in @((Join-Path $taskBase 'ChatQSigning'),$taskDirectory)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Private signing directories cannot be links'}}
$keyFile=Join-Path $taskDirectory 'chatq-release.jks';$recordFile=Join-Path $taskDirectory 'credentials.dpapi';$publicFile=Join-Path $taskDirectory 'signer.json';$certificateFile=Join-Path $taskDirectory 'signer.cer'
foreach($p in @($keyFile,$recordFile,$publicFile,$certificateFile)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Signing files cannot be links'}}
if(Test-Path -LiteralPath $publicFile){
    if(!(Test-Path -LiteralPath $keyFile)-or!(Test-Path -LiteralPath $recordFile)){throw 'Existing signing material is incomplete; restore its backup, never regenerate an installed app signer'}
    Get-Content -LiteralPath $publicFile -Raw
    return
}
if(!$Initialize){throw 'No production key exists. Run with -Initialize to create a dedicated Android signer.'}
if((Test-Path -LiteralPath $keyFile)-or(Test-Path -LiteralPath $recordFile)){throw 'Partial signing setup exists. Preserve it and recover manually; no key was replaced.'}
if(![IO.Path]::IsPathFullyQualified($Keytool)-or!(Test-Path -LiteralPath $Keytool)){throw 'Provide the absolute JDK keytool.exe path'}
New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=Get-Acl -LiteralPath $taskDirectory;$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($identity)
foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl -LiteralPath $taskDirectory -AclObject $acl
$storeSecret=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32));$keySecret=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$record=@{schema=1;storeFile=$keyFile;keyAlias='chatq-release';storePassword=$storeSecret;keyPassword=$keySecret}
$plain=[Text.Encoding]::UTF8.GetBytes(($record|ConvertTo-Json -Compress));$encrypted=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$stream=[IO.FileStream]::new($recordFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($encrypted);$stream.Flush($true)}finally{$stream.Dispose()}}finally{[Security.Cryptography.CryptographicOperations]::ZeroMemory($plain)}
$oldStore=$env:CHATQ_ANDROID_STORE_PASSWORD;$oldKey=$env:CHATQ_ANDROID_KEY_PASSWORD
try{
    $env:CHATQ_ANDROID_STORE_PASSWORD=$storeSecret;$env:CHATQ_ANDROID_KEY_PASSWORD=$keySecret
    $generation=& $Keytool -genkeypair -alias chatq-release -keyalg RSA -keysize 3072 -sigalg SHA256withRSA -validity 10000 -dname 'CN=ChatQ Android Release,OU=ChatQ,O=ChatQ' -keystore $keyFile -storetype JKS -storepass:env CHATQ_ANDROID_STORE_PASSWORD -keypass:env CHATQ_ANDROID_KEY_PASSWORD 2>&1
    if($LASTEXITCODE){throw 'Android key generation failed. Partial private material is preserved; do not regenerate over it.'}
    $export=& $Keytool -exportcert -alias chatq-release -keystore $keyFile -storetype JKS -storepass:env CHATQ_ANDROID_STORE_PASSWORD -file $certificateFile 2>&1
    if($LASTEXITCODE){throw 'Public certificate export failed; private material is preserved'}
    $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new([IO.File]::ReadAllBytes($certificateFile))
    try{$fingerprint=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($cert.RawData)).ToLowerInvariant();$metadata=[ordered]@{schema=1;packageName='com.jaxon.app.chatq.release';subject=$cert.Subject;sha256=$fingerprint;validUntil=$cert.NotAfter.ToUniversalTime().ToString('o');algorithm='RSA3072/SHA256';privateMaterialInGit=$false;passwordStorage='Windows DPAPI CurrentUser';portableBackupRequired=$true}}finally{$cert.Dispose()}
    $json=$metadata|ConvertTo-Json;[IO.File]::WriteAllText($publicFile,$json+[Environment]::NewLine,[Text.UTF8Encoding]::new($false));$json
}finally{
    $env:CHATQ_ANDROID_STORE_PASSWORD=$oldStore;$env:CHATQ_ANDROID_KEY_PASSWORD=$oldKey
    $storeSecret=$null;$keySecret=$null;$record=$null;$generation=$null;$export=$null
}
