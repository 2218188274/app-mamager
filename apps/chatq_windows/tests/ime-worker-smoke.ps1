# Invoke only from installer-smoke.ps1 in the already verified disposable Windows VM.
if($env:GITHUB_ACTIONS-ne'true'-or$env:RUNNER_OS-ne'Windows'){throw 'Disposable VM required'}
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $root 'ChatQ.exe';$info.ArgumentList.Add('--ime-worker');$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$worker=[Diagnostics.Process]::new();$worker.StartInfo=$info
if(!$worker.Start()){throw 'Hidden worker did not start'}
try {
 $writer=[IO.BinaryWriter]::new($worker.StandardInput.BaseStream,[Text.Encoding]::Unicode,$true)
 $writer.Write([uint32]0x31495143);$writer.Write([uint32]2);$text='00000000000000000000000000000000';$writer.Write([uint32]$text.Length);$writer.Write([Text.Encoding]::Unicode.GetBytes($text));$writer.Flush();$worker.StandardInput.Close()
 $bytes=[IO.MemoryStream]::new();$read=$worker.StandardOutput.BaseStream.CopyToAsync($bytes)
 if(!$worker.WaitForExit(20000)){$worker.Kill();throw 'Hidden worker timed out'};$read.GetAwaiter().GetResult()
 $bytes.Position=0;$reader=[IO.BinaryReader]::new($bytes)
 if($reader.ReadUInt32()-ne 0x31495143-or$reader.ReadUInt32()-ne 4-or$reader.ReadUInt32()-ne 0){throw 'Packaged worker protocol mismatch'}
 if($bytes.Length-gt 1024-or$worker.StandardError.ReadToEnd().Length-ne 0){throw 'Unexpected hidden-worker output'}
 Write-Output 'PASS packaged hidden IME worker, private stdin/stdout; no model, window or stored user data'
}finally{if(!$worker.HasExited){$worker.Kill()};$worker.Dispose()}
