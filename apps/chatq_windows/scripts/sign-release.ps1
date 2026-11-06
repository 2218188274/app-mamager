param(
    [ValidateSet('check','package')][string]$Mode='check',
    [string]$CertificateThumbprint=$env:CHATQ_WINDOWS_CERT_THUMBPRINT,
    [string]$ExpectedSubject=$env:CHATQ_WINDOWS_CERT_SUBJECT,
    [string]$SignTool,
    [string]$InnoCompiler
)
$ErrorActionPreference='Stop'
function Test-ChatQCertificate([Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,[string]$Subject){
    if(!$Certificate-or!$Subject-or$Certificate.Subject-ne$Subject){throw 'Signing certificate subject must match the explicitly configured publisher'}
    if(!$Certificate.HasPrivateKey){throw 'A corresponding protected private key is required'}
    if($Certificate.Subject-eq$Certificate.Issuer){throw 'Self-signed/test certificates cannot sign an official Windows release'}
    $now=[DateTime]::UtcNow;if($Certificate.NotBefore.ToUniversalTime()-gt$now-or$Certificate.NotAfter.ToUniversalTime()-le$now){throw 'Signing certificate is not currently valid'}
    $eku=@($Certificate.Extensions|Where-Object{$_.Oid.Value-eq'2.5.29.37'}|ForEach-Object{$_.EnhancedKeyUsages}|ForEach-Object{$_.Value})
    if('1.3.6.1.5.5.7.3.3'-notin$eku){throw 'Certificate does not permit code signing'}
    $chain=[Security.Cryptography.X509Certificates.X509Chain]::new()
    try{$chain.ChainPolicy.RevocationMode='Online';$chain.ChainPolicy.VerificationFlags='NoFlag';$chain.ChainPolicy.UrlRetrievalTimeout=[TimeSpan]::FromSeconds(10);if(!$chain.Build($Certificate)){throw 'Signing certificate trust/revocation validation failed'}}finally{$chain.Dispose()}
}
if(!$CertificateThumbprint-or!$ExpectedSubject){
    [ordered]@{ready=$false;reason='A developer-owned trusted code-signing certificate and exact publisher subject are required';selfSignedAccepted=$false;filesSigned=0}|ConvertTo-Json
    if($Mode-ne'check'){throw 'Production Windows signing is not configured'}
    return
}
$thumb=$CertificateThumbprint.Replace(' ','').ToUpperInvariant();if($thumb-notmatch'^[A-F0-9]{40}$'){throw 'Provide an exact certificate-store SHA1 thumbprint'}
$certificate=Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumb" -ErrorAction Stop
Test-ChatQCertificate $certificate $ExpectedSubject
if($Mode-eq'check'){[ordered]@{ready=$true;subject=$certificate.Subject;thumbprint=$thumb;validUntil=$certificate.NotAfter.ToUniversalTime().ToString('o');filesSigned=0}|ConvertTo-Json;return}
foreach($tool in @($SignTool,$InnoCompiler)){
    if(!$tool-or![IO.Path]::IsPathFullyQualified($tool)-or!(Test-Path -LiteralPath $tool)){throw 'Provide absolute paths to the official Windows SDK SignTool and Inno Setup compiler'}
    if((Get-Item -LiteralPath $tool).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Signing tool paths cannot be links'}
    if((Get-AuthenticodeSignature -LiteralPath $tool).Status-ne'Valid'){throw 'Signing tools must have valid publisher signatures'}
}
if([IO.Path]::GetFileName($SignTool)-ine'signtool.exe'-or(Get-AuthenticodeSignature -LiteralPath $SignTool).SignerCertificate.Subject-notmatch'Microsoft'){throw 'Use the Microsoft SDK signtool.exe'}
if([IO.Path]::GetFileName($InnoCompiler)-ine'ISCC.exe'){throw 'Use the Inno Setup ISCC.exe compiler'}
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$out=Join-Path $project 'out';$version=([xml](Get-Content -LiteralPath (Join-Path $project 'Directory.Build.props') -Raw)).Project.PropertyGroup.Version
if($version-notmatch'^\d+\.\d+\.\d+$'){throw 'Unexpected package version'}
$payload=@('assistant/ChatQ.exe','x64/ChatQTip.dll','x86/ChatQTip.dll')|ForEach-Object{Join-Path $out $_}
$installer=Join-Path $out "ChatQ-Windows-$version-x64-Setup.exe";$portable=Join-Path $out "ChatQ-Windows-$version-x64-Portable.zip"
if((Test-Path -LiteralPath $installer)-or(Test-Path -LiteralPath $portable)){throw 'Preserve existing packages; use a fresh output directory for official signing'}
foreach($file in $payload){if(!(Test-Path -LiteralPath $file)-or((Get-Item -LiteralPath $file).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Build all three release payloads before signing'}}
function Confirm-ChatQSignature([string]$File){
    $signature=Get-AuthenticodeSignature -LiteralPath $File
    if($signature.Status-ne'Valid'-or$signature.SignerCertificate.Thumbprint-ne$thumb-or!$signature.TimeStamperCertificate){throw 'Signed file must have the expected trusted publisher and a valid timestamp'}
}
foreach($file in $payload){& $SignTool sign /s My /sha1 $thumb /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $file;if($LASTEXITCODE){throw 'Payload signing failed'};Confirm-ChatQSignature $file}
# $f is Inno Setup's safely quoted filename placeholder, never a shell interpolation.
$command='"'+$SignTool+'" sign /s My /sha1 '+$thumb+' /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $f'
& $InnoCompiler /DChatQProduction ("/Schatqsign="+$command) (Join-Path $project 'installer/ChatQ.iss')
if($LASTEXITCODE){throw 'Signed installer/uninstaller packaging failed'}
Confirm-ChatQSignature $installer
$signedCache=Join-Path $out 'signed-uninstaller';$uninstallers=@(Get-ChildItem -LiteralPath $signedCache -File|Where-Object{ $uninstallerInput=[IO.File]::OpenRead($_.FullName);try{$uninstallerInput.ReadByte()-eq77-and$uninstallerInput.ReadByte()-eq90}finally{$uninstallerInput.Dispose()} });if(!$uninstallers){throw 'Retain Inno signed-uninstaller PE output for verification'};foreach($uninstaller in $uninstallers){Confirm-ChatQSignature $uninstaller.FullName}
Compress-Archive -Path (Join-Path $out 'assistant/*') -DestinationPath $portable
[ordered]@{version=$version;subject=$certificate.Subject;thumbprint=$thumb;payloadSignaturesVerified=$true;installerSignatureVerified=$true;uninstallerSignatureVerified=$true;timestampRequired=$true;selfSignedAccepted=$false;installerSha256=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant();portableSha256=(Get-FileHash -LiteralPath $portable -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json
