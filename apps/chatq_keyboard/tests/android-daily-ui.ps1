param([string]$Adb = 'adb', [string]$Serial = 'emulator-5554', [string]$Output = "$env:TEMP\chatq-daily-qa", [switch]$SkipBasics, [switch]$SkipGestures, [switch]$OnlyActions)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Output | Out-Null
$script:passed = [System.Collections.Generic.List[string]]::new()
function Device([string]$Command) {
  $result = & $Adb -s $Serial shell $Command
  if ($LASTEXITCODE) { throw "ADB failed: $Command" }
  return $result
}
function Tap([int]$X, [int]$Y) { Device "input tap $X $Y" | Out-Null }
function Fresh([string]$Mode = 'text', [string]$Seed = 'Q', [int]$Start = 0, [int]$End = -1) {
  if ($End -lt 0) { $End = $Seed.Length }
  Device "am start -S -n com.chatq.keyboardfixture/.FixtureActivity --es mode '$Mode' --es seed '$Seed' --ei start $Start --ei end $End" | Out-Null
  Start-Sleep -Milliseconds 1100
}
function Ui {
  Device 'uiautomator dump /sdcard/chatq-daily-qa.xml' | Out-Null
  [xml]$xml = ((& $Adb -s $Serial exec-out cat /sdcard/chatq-daily-qa.xml) -join "`n")
  return $xml
}
function Text([int]$Index = 0) {
  $xml = Ui; $value = @($xml.SelectNodes('//node[@class="android.widget.EditText"]'))[$Index].text
  # Android 11 exposes the fixture's hint as text when its editor is empty.
  if ($value -ceq @('Text','Email','Password','Number')[$Index]) { return '' }; return $value
}
function Equal([string]$Name, [string]$Expected, [string]$Actual) {
  if ($Expected -cne $Actual) { throw "$Name expected [$Expected], received [$Actual]" }
  $script:passed.Add($Name); Write-Output "PASS $Name"
}
function Expect([string]$Name, [string]$Expected) { Equal $Name $Expected (Text) }
function Letters([string]$Value) {
  $keys = @{}; $xs = @(19,50,81,112,143,175,206,238,269,301)
  for ($i = 0; $i -lt 10; $i++) { $keys["qwertyuiop"[$i]] = @($xs[$i],456) }
  $xs = @(32,63,95,127,159,190,222,253,285)
  for ($i = 0; $i -lt 9; $i++) { $keys["asdfghjkl"[$i]] = @($xs[$i],508) }
  $xs = @(63,95,127,159,191,223,255)
  for ($i = 0; $i -lt 7; $i++) { $keys["zxcvbnm"[$i]] = @($xs[$i],560) }
  $commands = foreach ($char in $Value.ToCharArray()) { if (!$keys.ContainsKey($char)) { throw "Unknown letter $char" }; $point = $keys[$char]; "input tap $($point[0]) $($point[1])" }
  Device ($commands -join '; ') | Out-Null
}
try {
  if (!$OnlyActions) {
  if (!$SkipBasics) {
  Fresh; Letters 'nihao'; Tap 169 612; Expect 'pinyin space commits candidate' '你好'
  Tap 100 612; Letters 'zhongguo'; Tap 169 612; Tap 237 612; Expect 'Chinese punctuation' '你好，中国。'
  Fresh; Letters 'nihao'; Tap 300 408; Tap 56 456; Expect 'expanded candidate selection' '你好'
  Fresh; Letters 'nihaox'; Tap 296 560; Tap 169 612; Expect 'delete composing letter' '你好'
  Fresh; Letters 'nihao'; Device 'input keyevent 4' | Out-Null; Expect 'hide commits composition' '你好'
  Fresh; Device 'input swipe 19 456 19 456 700' | Out-Null; Expect 'long press letter inserts digit only' '1'
  Fresh; Tap 64 612; Letters 'hello'; Tap 169 612; Letters 'world'; Expect 'English and wide space' 'hello world'
  Fresh; Tap 24 560; Letters 'a'; Letters 'b'; Expect 'one letter uppercase' 'Ab'
  }
  if (!$SkipGestures) {
  $gesture = (Device 'am instrument -w com.chatq.keyboardfixture/.GestureInstrumentation') -join "`n"
  if ($gesture -notmatch 'PASS double tap caps lock') { throw $gesture }
  $script:passed.Add('double tap caps lock'); Write-Output 'PASS double tap caps lock'
  Fresh 'text' 'abcd' 2 2; Tap 133 344; Tap 56 508; Tap 34 612; Letters 'x'; Expect 'cursor moves left' 'axbcd'
  Fresh 'text' 'abcd' 2 2; Device 'input swipe 195 612 147 612 350' | Out-Null; Letters 'x'; Expect 'space swipe moves cursor without inserting space' 'xabcd'
  }
  Fresh 'text' 'abcd'; Tap 133 344; Tap 97 612; Tap 264 456; Tap 223 612; Expect 'copy and paste selected text' 'abcdabcd'
  Fresh 'text' 'abcd'; Tap 133 344; Tap 160 612; Expect 'cut selection' ''; Tap 223 612; Expect 'paste after cut' 'abcd'
  Fresh 'text' 'abcd' 2 2; Tap 133 344; Tap 160 508; Tap 264 508; Tap 264 560; Expect 'select next character and delete' 'abd'
  Fresh; Tap 22 612; Device 'input tap 34 456; input tap 97 456; input tap 160 456; input tap 160 612' | Out-Null; Expect 'number pad' '1230'
  Fresh 'decimal'; Device 'input tap 223 508; input tap 34 456; input tap 223 560; input tap 97 456' | Out-Null; Expect 'signed decimal pad' '-1.2'
  Fresh 'phone'; Device 'input tap 34 612; input tap 97 612; input tap 34 456' | Out-Null; Expect 'phone star and hash' '*#1'
  Fresh 'uri'; Letters 'abc'; Tap 237 612; Letters 'com'; Expect 'URL forces direct ASCII' 'abc.com'
  Fresh; Tap 100 118; Letters 'nihao'; Equal 'email forces direct ASCII' 'nihao' (Text 1)
  Fresh 'password'; Letters 'nihao'; Tap 34 344; Device 'screencap -p /sdcard/chatq-password.png' | Out-Null
  & $Adb -s $Serial pull /sdcard/chatq-password.png "$Output\password.png" | Out-Null
  # Return to ordinary fields, remembered English must remain available.
  Fresh; Tap 64 612; Letters 'nihao'; Tap 169 612; Expect 'Chinese preference restored after secure fields' '你好'
  Fresh; Tap 81 344; Tap 22 456; Expect 'emoji insertion' '😀'; Tap 242 612; Expect 'emoji delete' ''
  Fresh 'text' 'A👨‍👩‍👧‍👦' 12 12; Tap 296 560; Expect 'ZWJ family deletes as one unit' 'A'
  Fresh 'text' 'A👍🏽' 5 5; Tap 296 560; Expect 'skin tone emoji deletes as one unit' 'A'
  Fresh 'text' 'A🇨🇳' 5 5; Tap 296 560; Expect 'flag emoji deletes as one unit' 'A'
  }
  Fresh 'search'; Letters 'nihao'; Tap 285 612; Expect 'enter confirms composition' '你好'
  $xml = Ui; Equal 'confirm does not submit search' 'action:0 count:0' ($xml.SelectSingleNode('//node[starts-with(@text,"action:")]').text)
  Tap 285 612; $xml = Ui; Equal 'search editor action' 'action:3 count:1' ($xml.SelectSingleNode('//node[starts-with(@text,"action:")]').text)
  Fresh 'send'; Tap 285 612; $xml = Ui; Equal 'send editor action' 'action:4 count:1' ($xml.SelectSingleNode('//node[starts-with(@text,"action:")]').text)
  Fresh 'multiline' 'abc' 3 3; Tap 285 612; Expect 'multiline enter inserts newline' "abc`n"
  $xml = Ui; Equal 'NO_ENTER_ACTION prevents sending' 'action:0 count:0' ($xml.SelectSingleNode('//node[starts-with(@text,"action:")]').text)
  $script:passed | ConvertTo-Json | Set-Content -Encoding utf8 "$Output\results.json"
  Write-Output "PASS $($script:passed.Count) daily input assertions"
} catch {
  Device 'screencap -p /sdcard/chatq-daily-failure.png' | Out-Null
  & $Adb -s $Serial pull /sdcard/chatq-daily-failure.png "$Output\failure.png" | Out-Null
  throw
}
