param([string]$Sdk=$env:ANDROID_HOME, [string]$Jdk=$env:JAVA_HOME, [Parameter(Mandatory=$true)][string]$Output, [string]$KeyStore=(Join-Path $PSScriptRoot '../android/app/debug.keystore'),[switch]$NativeOnly,[string]$TargetPackage='com.jaxon.app.chatq',[string]$FixturePackage='com.chatq.keyboardtests',[string]$StorePasswordEnvironment,[string]$KeyPasswordEnvironment,[string]$KeyAlias)
$ErrorActionPreference='Stop'
if (!$Sdk -or !$Jdk) { throw 'Set ANDROID_HOME and JAVA_HOME, or pass -Sdk and -Jdk.' }
$env:JAVA_HOME=$Jdk
if($TargetPackage-notmatch'^[a-zA-Z][a-zA-Z0-9_.]+$'-or$FixturePackage-notmatch'^[a-zA-Z][a-zA-Z0-9_.]+$'){throw 'Invalid fixture package name'}
$kinds=if($NativeOnly){@('native')}else{@('fixture','native')}
foreach($kind in $kinds) {
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
  $assetArgs=@();if(Test-Path -LiteralPath "$source/assets"){
    $assetSource=[IO.Path]::GetFullPath("$source/assets");$assetOutput=Join-Path $folder 'assets';New-Item -ItemType Directory -Force -Path $assetOutput | Out-Null
    Get-ChildItem -LiteralPath $assetSource -File -Recurse | ForEach-Object{$relative=$_.FullName.Substring($assetSource.Length).TrimStart('\','/');$target=Join-Path $assetOutput $relative;New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null;Copy-Item -LiteralPath $_.FullName -Destination $target -Force}
    $assetArgs=@('-A',$assetOutput)
  }
  $manifest="$source/AndroidManifest.xml"
  if($kind-eq'native'){$manifest=Join-Path $folder 'AndroidManifest.xml';$xml=[IO.File]::ReadAllText("$source/AndroidManifest.xml").Replace('package="com.chatq.keyboardtests"',('package="'+$FixturePackage+'"')).Replace('android:targetPackage="com.jaxon.app.chatq"',('android:targetPackage="'+$TargetPackage+'"')).Replace('android:name=".KeyboardInstrumentation"','android:name="com.chatq.keyboardtests.KeyboardInstrumentation"');[IO.File]::WriteAllText($manifest,$xml,[Text.UTF8Encoding]::new($false))}
  & "$Sdk/build-tools/36.0.0/aapt2.exe" link -o $apk --manifest $manifest -I "$Sdk/platforms/android-36/android.jar" @assetArgs
  if($LASTEXITCODE){throw "aapt2 $kind failed"}
  Push-Location $dex
  try { & "$Sdk/build-tools/36.0.0/aapt.exe" add $apk classes.dex } finally { Pop-Location }
  $storeArgument='pass:android';$keyArgument='pass:android';$aliasArgs=@()
  if($StorePasswordEnvironment){if($StorePasswordEnvironment-notmatch'^[A-Z0-9_]+$'-or$KeyPasswordEnvironment-notmatch'^[A-Z0-9_]+$'-or![Environment]::GetEnvironmentVariable($StorePasswordEnvironment)-or![Environment]::GetEnvironmentVariable($KeyPasswordEnvironment)){throw 'Provide existing environment names for fixture signing; never passwords in arguments'};$storeArgument='env:'+$StorePasswordEnvironment;$keyArgument='env:'+$KeyPasswordEnvironment;if(!$KeyAlias){throw 'Fixture signing alias required'};$aliasArgs=@('--ks-key-alias',$KeyAlias)}
  & "$Sdk/build-tools/36.0.0/apksigner.bat" sign --ks $KeyStore --ks-pass $storeArgument --key-pass $keyArgument @aliasArgs $apk
  if($LASTEXITCODE){throw "sign $kind failed"}
  Write-Output $apk
}
