param([string]$Adb='adb',[string]$Serial='emulator-5554',[string]$Output="$env:TEMP\chatq-advanced-qa")
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force $Output | Out-Null
$script:passed=[System.Collections.Generic.List[string]]::new()
function Device([string]$Command) { $result=& $Adb -s $Serial shell $Command; if($LASTEXITCODE){throw "ADB failed: $Command"}; return $result }
function Tap([int]$X,[int]$Y) { Device "input tap $X $Y" | Out-Null }
function Fresh([string]$Mode='text',[string]$Seed='Q',[int]$Start=0,[int]$End=-1) { if($End -lt 0){$End=$Seed.Length}; Device "am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode '$Mode' --es seed '$Seed' --ei start $Start --ei end $End" | Out-Null; Start-Sleep -Milliseconds 850 }
function Ui { Device 'uiautomator dump /sdcard/chatq-advanced.xml' | Out-Null; [xml]$xml=((& $Adb -s $Serial exec-out cat /sdcard/chatq-advanced.xml)-join "`n"); return $xml }
function Text { $xml=Ui; $value=@($xml.SelectNodes('//node[@class="android.widget.EditText"]'))[0].text; if($value -ceq 'Text'){return ''};return $value }
function Expect([string]$Name,[string]$Expected) { $actual=Text;if($actual -cne $Expected){throw "$Name expected [$Expected], received [$actual]"};$script:passed.Add($Name);Write-Output "PASS $Name" }
function Letters([string]$Value) {
  $keys=@{};$xs=@(19,50,81,112,143,175,206,238,269,301);for($i=0;$i -lt 10;$i++){$keys["qwertyuiop"[$i]]=@($xs[$i],456)}
  $xs=@(32,63,95,127,159,190,222,253,285);for($i=0;$i -lt 9;$i++){$keys["asdfghjkl"[$i]]=@($xs[$i],508)}
  $xs=@(63,95,127,159,191,223,255);for($i=0;$i -lt 7;$i++){$keys["zxcvbnm"[$i]]=@($xs[$i],560)}
  $commands=foreach($char in $Value.ToCharArray()){$p=$keys[$char];"input tap $($p[0]) $($p[1])"};Device ($commands -join '; ') | Out-Null
}
function Digits([string]$Value) {
  $keys=@{'2'=@(121,456);'3'=@(199,456);'4'=@(42,508);'5'=@(121,508);'6'=@(199,508);'7'=@(42,560);'8'=@(121,560);'9'=@(199,560)}
  $commands=foreach($char in $Value.ToCharArray()){$p=$keys[[string]$char];"input tap $($p[0]) $($p[1])"};Device ($commands -join '; ') | Out-Null
}
# Start with the Chinese nine-key layout, standard height and no number row.
try {
  Fresh;Digits '64426';Tap 150 612;Expect 'nine-key nihao candidate' '你好'
  Fresh;Digits '94664486';Tap 150 612;Expect 'nine-key zhongguo phrase' '中国'
  Fresh;Digits '644269';Tap 278 456;Tap 150 612;Expect 'nine-key composing delete' '你好'
  Fresh;Digits '64426';Device 'input keyevent 4' | Out-Null;Expect 'nine-key hide commits' '你好'
  Fresh;Tap 237 344;Tap 80 612;Tap 237 344
  Fresh;Tap 64 612;Letters 'teh';Tap 169 612;Expect 'English space corrects transposition' 'the '
  Tap 296 560;Expect 'backspace restores original typo' 'teh'
  Tap 296 560;Expect 'backspace continues original composition' 'te'
  Fresh;Letters 'helo';Tap 169 612;Expect 'English missing letter correction' 'hello '
  Fresh;Letters 'wrold';Tap 169 612;Expect 'English frequency correction' 'world '
  Fresh;Letters 'hello';Tap 169 612;Expect 'correct English unchanged' 'hello '
  Fresh 'uri';Letters 'teh';Tap 169 612;Expect 'URI bypasses correction' 'teh '
  Fresh 'private';Letters 'teh';Tap 169 612;Expect 'private editor bypasses correction' 'teh '
  Fresh 'send';Letters 'teh';Tap 285 612;Expect 'English enter commits correction' 'the'
  $xml=Ui;if($xml.SelectSingleNode('//node[starts-with(@text,"action:")]').text -cne 'action:4 count:1'){throw 'English enter action failed'}
  $script:passed.Add('English enter performs editor action once')
  $script:passed | ConvertTo-Json | Set-Content -Encoding utf8 "$Output\results.json"
  Write-Output "PASS $($script:passed.Count) advanced input assertions"
} catch { Device 'screencap -p /sdcard/chatq-advanced-failure.png' | Out-Null; & $Adb -s $Serial pull /sdcard/chatq-advanced-failure.png "$Output\failure.png" | Out-Null;throw }
