param([ValidateSet('Export','Restore','Test')][string]$Mode='Export',[string]$File,[Security.SecureString]$Password,[string]$Keytool)
$ErrorActionPreference='Stop'
function Protect-KeyArchive([byte[]]$Plain,[string]$Secret){
    if($Secret.Length-lt12-or$Secret.Length-gt128-or[string]::IsNullOrWhiteSpace($Secret)){throw 'Backup password must contain 12–128 characters'}
    if($Plain.Length-gt131072){throw 'Signing backup is too large'}
    [byte[]]$header=New-Object byte[] 44;[Text.Encoding]::ASCII.GetBytes('CHATQSK1').CopyTo($header,0);[BitConverter]::GetBytes([int]600000).CopyTo($header,8)
    [byte[]]$salt=[Security.Cryptography.RandomNumberGenerator]::GetBytes(16);[byte[]]$iv=[Security.Cryptography.RandomNumberGenerator]::GetBytes(12);$salt.CopyTo($header,12);$iv.CopyTo($header,28);[BitConverter]::GetBytes([int]$Plain.Length).CopyTo($header,40)
    [byte[]]$key=[Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2($Secret,$salt,600000,[Security.Cryptography.HashAlgorithmName]::SHA256,32);[byte[]]$cipher=New-Object byte[] $Plain.Length;[byte[]]$tag=New-Object byte[] 16;$aes=[Security.Cryptography.AesGcm]::new($key,16)
    try{$aes.Encrypt($iv,$Plain,$cipher,$tag,$header);return ,([byte[]]($header+$cipher+$tag))}finally{$aes.Dispose();[Security.Cryptography.CryptographicOperations]::ZeroMemory($key)}
}
function Unprotect-KeyArchive([byte[]]$Archive,[string]$Secret){
    if($Secret.Length-lt12-or$Secret.Length-gt128-or$Archive.Length-lt60-or$Archive.Length-gt131132-or[Text.Encoding]::ASCII.GetString($Archive,0,8)-ne'CHATQSK1'-or[BitConverter]::ToInt32($Archive,8)-ne600000-or[BitConverter]::ToInt32($Archive,40)-ne($Archive.Length-60)){throw 'Invalid signing archive'}
    [byte[]]$salt=$Archive[12..27];[byte[]]$iv=$Archive[28..39];[byte[]]$header=$Archive[0..43];[byte[]]$cipher=$Archive[44..($Archive.Length-17)];[byte[]]$tag=$Archive[($Archive.Length-16)..($Archive.Length-1)]
    [byte[]]$key=[Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2($Secret,$salt,600000,[Security.Cryptography.HashAlgorithmName]::SHA256,32);[byte[]]$plain=New-Object byte[] $cipher.Length;$aes=[Security.Cryptography.AesGcm]::new($key,16)
    try{$aes.Decrypt($iv,$cipher,$tag,$plain,$header);return ,$plain}catch{[Security.Cryptography.CryptographicOperations]::ZeroMemory($plain);throw 'Password incorrect or signing backup damaged'}finally{$aes.Dispose();[Security.Cryptography.CryptographicOperations]::ZeroMemory($key)}
}
if(![BitConverter]::IsLittleEndian){throw 'This helper requires Windows little-endian .NET'}
if($Mode-eq'Test'){
    [byte[]]$plain=[Text.Encoding]::UTF8.GetBytes('{"synthetic":"测试签名备份😀","key":"not-a-real-key"}');$cipher=Protect-KeyArchive $plain 'synthetic-备份-password';$restored=Unprotect-KeyArchive $cipher 'synthetic-备份-password';if([Convert]::ToBase64String($plain)-ne[Convert]::ToBase64String($restored)){throw 'Backup roundtrip failed'}
    $wrong=$false;try{$ignored=Unprotect-KeyArchive $cipher 'synthetic-wrong-password'}catch{$wrong=$true};if(!$wrong){throw 'Wrong password was accepted'}
    $cipher[$cipher.Length-1]=$cipher[$cipher.Length-1]-bxor1;$tamper=$false;try{$ignored=Unprotect-KeyArchive $cipher 'synthetic-备份-password'}catch{$tamper=$true};if(!$tamper){throw 'Tampering was accepted'}
    [ordered]@{checks=3;syntheticOnly=$true;privateKeyRead=$false;certificateInstalled=$false}|ConvertTo-Json;return
}
if(!$File-or![IO.Path]::IsPathFullyQualified($File)-or[IO.Path]::GetExtension($File)-ine'.cqsigning'){throw 'Select an absolute .cqsigning path outside the source repository'}
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$archivePath=[IO.Path]::GetFullPath($File)
if($archivePath.StartsWith($repository+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Do not save signing backups in the source repository'}
if((Test-Path -LiteralPath $archivePath)-and((Get-Item -LiteralPath $archivePath).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Signing archive cannot be a link'}
if(!$Password){$Password=Read-Host '备份密码（12–128个字符，请自行保管，不要发到聊天里）' -AsSecureString}
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
try{$secret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
$root=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ChatQSigning/android-production';$recordPath=Join-Path $root 'credentials.dpapi';$keyPath=Join-Path $root 'chatq-release.jks';$metadataPath=Join-Path $root 'signer.json';$plain=$null;$keyBytes=$null
try{
    if($Mode-eq'Export'){
        if(Test-Path -LiteralPath $archivePath){throw 'Preserve the existing archive; select a new filename'}
        $confirmation=Read-Host '再次输入备份密码' -AsSecureString;$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation);try{$repeat=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};if($repeat-cne$secret){throw 'Backup passwords differ'};$repeat=$null
        foreach($p in @($root,$recordPath,$keyPath,$metadataPath)){if(!(Test-Path -LiteralPath $p)-or((Get-Item -LiteralPath $p).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Dedicated signing material unavailable'}}
        $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($recordPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$record=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json;$metadata=Get-Content -LiteralPath $metadataPath -Raw|ConvertFrom-Json;$keyBytes=[IO.File]::ReadAllBytes($keyPath)
        $payload=@{schema=1;keyAlias=$record.keyAlias;storePassword=$record.storePassword;keyPassword=$record.keyPassword;signerSha256=$metadata.sha256;keystore=[Convert]::ToBase64String($keyBytes)}
        [byte[]]$bytes=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Compress));try{$expected=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes));$encrypted=Protect-KeyArchive $bytes $secret}finally{[Security.Cryptography.CryptographicOperations]::ZeroMemory($bytes)}
        $out=[IO.FileStream]::new($archivePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$out.Write($encrypted);$out.Flush($true)}finally{$out.Dispose()}
        $verify=Unprotect-KeyArchive ([IO.File]::ReadAllBytes($archivePath)) $secret;try{if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($verify))-ne$expected){throw 'Signing backup read-back did not match'}}finally{[Security.Cryptography.CryptographicOperations]::ZeroMemory($verify)}
        $metadata.portableBackupRequired=$false;$metadata|Add-Member -NotePropertyName lastPortableBackupAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force;[IO.File]::WriteAllText($metadataPath,($metadata|ConvertTo-Json)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
        [ordered]@{exported=$true;path=$archivePath;signerSha256=$metadata.sha256;encrypted=$true;copyToSeparateStorage=$true}|ConvertTo-Json
    }else{
        if(!(Test-Path -LiteralPath $archivePath)-or(Get-Item -LiteralPath $archivePath).Length-gt131132){throw 'Signing archive unavailable or too large'}
        if((Test-Path -LiteralPath $keyPath)-or(Test-Path -LiteralPath $recordPath)-or(Test-Path -LiteralPath $metadataPath)){throw 'Existing signer is preserved. Restore only into an empty signing directory on the recovery Windows account.'}
        if(!$Keytool-or![IO.Path]::IsPathFullyQualified($Keytool)-or!(Test-Path -LiteralPath $Keytool)){throw 'Restore requires the absolute JDK keytool.exe path'}
        $plain=Unprotect-KeyArchive ([IO.File]::ReadAllBytes($archivePath)) $secret;$payload=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json -Depth 8
        $fields=@($payload.PSObject.Properties.Name);$required=@('schema','keyAlias','storePassword','keyPassword','signerSha256','keystore');if($fields.Count-ne6-or@($fields|Where-Object{$_-notin$required}).Count-or$payload.schema-ne1-or$payload.keyAlias-ne'chatq-release'-or$payload.signerSha256-notmatch'^[a-f0-9]{64}$'){throw 'Unsupported signing backup contents'}
        $keyBytes=[Convert]::FromBase64String($payload.keystore);if($keyBytes.Length-lt100-or$keyBytes.Length-gt65536){throw 'Invalid keystore size'}
        New-Item -ItemType Directory -Force -Path $root|Out-Null;if((Get-Item -LiteralPath $root).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Signing directory cannot be a link'}
        $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=Get-Acl -LiteralPath $root;$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($identity);foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};Set-Acl -LiteralPath $root -AclObject $acl
        $temporary=Join-Path $root ('verify-'+[Guid]::NewGuid().ToString('N')+'.jks');$cer=$temporary+'.cer';[IO.File]::WriteAllBytes($temporary,$keyBytes);$previous=$env:CHATQ_RESTORE_SIGNING_PASSWORD
        try{
            $env:CHATQ_RESTORE_SIGNING_PASSWORD=$payload.storePassword;$ignored=& $Keytool -exportcert -alias chatq-release -keystore $temporary -storetype JKS -storepass:env CHATQ_RESTORE_SIGNING_PASSWORD -file $cer 2>&1;if($LASTEXITCODE){throw 'Backup keystore could not be verified'}
            $certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new([IO.File]::ReadAllBytes($cer));try{$actual=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($certificate.RawData)).ToLowerInvariant();if($actual-ne$payload.signerSha256){throw 'Signer fingerprint does not match backup'};$metadata=[ordered]@{schema=1;packageName='com.jaxon.app.chatq.release';subject=$certificate.Subject;sha256=$actual;validUntil=$certificate.NotAfter.ToUniversalTime().ToString('o');passwordStorage='Windows DPAPI CurrentUser';portableBackupRequired=$false}}finally{$certificate.Dispose()}
            [IO.File]::Move($temporary,$keyPath);$record=@{schema=1;storeFile=$keyPath;keyAlias=$payload.keyAlias;storePassword=$payload.storePassword;keyPassword=$payload.keyPassword};$recordBytes=[Text.Encoding]::UTF8.GetBytes(($record|ConvertTo-Json -Compress));try{$encrypted=[Security.Cryptography.ProtectedData]::Protect($recordBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}finally{[Security.Cryptography.CryptographicOperations]::ZeroMemory($recordBytes)}
            $out=[IO.FileStream]::new($recordPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$out.Write($encrypted);$out.Flush($true)}finally{$out.Dispose()};[IO.File]::WriteAllText($metadataPath,($metadata|ConvertTo-Json)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false));[ordered]@{restored=$true;signerSha256=$actual;existingKeysReplaced=$false}|ConvertTo-Json
        }finally{$env:CHATQ_RESTORE_SIGNING_PASSWORD=$previous;foreach($p in @($temporary,$cer)){if((Test-Path -LiteralPath $p)-and[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($p))-eq[IO.Path]::GetFullPath($root)){Remove-Item -LiteralPath $p}}}
    }
}finally{if($plain){[Security.Cryptography.CryptographicOperations]::ZeroMemory($plain)};if($keyBytes){[Security.Cryptography.CryptographicOperations]::ZeroMemory($keyBytes)};$secret=$null;$payload=$null;$record=$null}
