$ErrorActionPreference='Stop'
# Evaluate only the pure certificate validation function. No certificate-store writes,
# executables, live accounts, private release keys or trust changes are involved.
$script=Join-Path $PSScriptRoot '../scripts/sign-release.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($script,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Signing helper did not parse'}
$function=$ast.Find({param($node)$node-is[Management.Automation.Language.FunctionDefinitionAst]-and$node.Name-eq'Test-ChatQCertificate'},$true)
if(!$function){throw 'Certificate validator missing'}
Invoke-Expression $function.Extent.Text
$checks=0
function Reject([scriptblock]$Action,[string]$Expected){
    try{& $Action;throw 'Invalid certificate was accepted'}catch{if($_.Exception.Message-notlike('*'+$Expected+'*')){throw}}
    $script:checks++
}
$key=[Security.Cryptography.RSA]::Create(2048)
$certificates=[Collections.Generic.List[Security.Cryptography.X509Certificates.X509Certificate2]]::new()
try{
    $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=ChatQ Synthetic Test',$key,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $oids=[Security.Cryptography.OidCollection]::new();[void]$oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$false))
    $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1),[DateTimeOffset]::UtcNow.AddDays(1));$certificates.Add($certificate)
    Reject {Test-ChatQCertificate $certificate 'CN=Other Publisher'} 'subject'
    $public=[Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate.RawData);$certificates.Add($public)
    Reject {Test-ChatQCertificate $public $public.Subject} 'private key'
    Reject {Test-ChatQCertificate $certificate $certificate.Subject} 'Self-signed/test'
    Reject {Test-ChatQCertificate $null 'CN=ChatQ'} 'subject'
    $result=& $script -Mode check -CertificateThumbprint '' -ExpectedSubject ''|ConvertFrom-Json
    if($result.ready-or$result.selfSignedAccepted-or$result.filesSigned-ne0){throw 'Missing certificate did not fail closed'};$checks++
    Reject {& $script -Mode package -CertificateThumbprint '' -ExpectedSubject ''|Out-Null} 'not configured'
    [ordered]@{checks=$checks;certificateInstalled=$false;privateReleaseKeyRead=$false;filesSigned=0;syntheticOnly=$true}|ConvertTo-Json
}finally{foreach($certificate in $certificates){$certificate.Dispose()};$key.Dispose()}
