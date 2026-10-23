param([string]$Sdk=$env:ANDROID_HOME, [string]$Jdk=$env:JAVA_HOME, [Parameter(Mandatory=$true)][string]$Output, [string]$KeyStore=(Join-Path $PSScriptRoot '../android/app/debug.keystore'))
$ErrorActionPreference='Stop'
if (!$Sdk -or !$Jdk) { throw 'Set ANDROID_HOME and JAVA_HOME, or pass -Sdk and -Jdk.' }
$env:JAVA_HOME=$Jdk
foreach($kind in @('fixture','native')) {
  $source=Join-Path $PSScriptRoot "android-$kind"
  $folder=Join-Path $Output $kind
  $classes=Join-Path $folder 'classes'; $dex=Join-Path $folder 'dex'
  New-Item -ItemType Directory -Path $classes,$dex -Force | Out-Null
  $javaFiles=@(Get-ChildItem -LiteralPath $source -Filter *.java | Select-Object -ExpandProperty FullName)
  & "$Jdk/bin/javac.exe" -encoding UTF-8 -source 8 -target 8 -bootclasspath "$Sdk/platforms/android-36/android.jar" -d $classes @javaFiles
  if($LASTEXITCODE){throw "javac $kind failed"}
  $classFiles=@(Get-ChildItem -LiteralPath $classes -Recurse -Filter *.class | Select-Object -ExpandProperty FullName)
  & "$Jdk/bin/java.exe" -cp "$Sdk/build-tools/36.0.0/lib/d8.jar" com.android.tools.r8.D8 --lib "$Sdk/platforms/android-36/android.jar" --output $dex @classFiles
  if($LASTEXITCODE){throw "d8 $kind failed"}
  $apk=Join-Path $folder "$kind.apk"
  & "$Sdk/build-tools/36.0.0/aapt2.exe" link -o $apk --manifest "$source/AndroidManifest.xml" -I "$Sdk/platforms/android-36/android.jar"
  if($LASTEXITCODE){throw "aapt2 $kind failed"}
  Push-Location $dex
  try { & "$Sdk/build-tools/36.0.0/aapt.exe" add $apk classes.dex } finally { Pop-Location }
  & "$Sdk/build-tools/36.0.0/apksigner.bat" sign --ks $KeyStore --ks-pass pass:android --key-pass pass:android $apk
  if($LASTEXITCODE){throw "sign $kind failed"}
  Write-Output $apk
}
