"""Read-only probe opt-in rejection checks. Synthetic config only; never load private calibration."""
import json
import pathlib
import subprocess
import sys
import tempfile

dotnet, dll = sys.argv[1:3]
with tempfile.TemporaryDirectory(prefix="chatq-readonly-probe-") as folder:
    config = pathlib.Path(folder) / "synthetic-unconfirmed.json"
    config.write_text(json.dumps({
        "Title": "SYNTHETIC-NONEXISTENT-WINDOW",
        "Executable": "C:\\SYNTHETIC\\Weixin.exe",
        "X": 0.03, "Y": 0.18, "Width": 0.44, "Height": 0.38,
        "ExpectedText": "聊商连接测试", "Seconds": 10,
        "SinglePrivateTestWindowConfirmed": False,
        "TestContentOnlyConfirmed": False,
    }), encoding="utf-8")
    for args, expected in [
        ([], "explicit_capture_argument_required"),
        (["--listen", str(config)], "explicit_capture_argument_required"),
        (["--listen", str(config), "--accept-test-window-capture"], "invalid_calibration"),
    ]:
        result = subprocess.run([dotnet, dll, *args], capture_output=True, text=True, timeout=15, check=False)
        data = json.loads(result.stdout)
        assert result.returncode == 2 and data["status"] == expected, data
        assert data["aiCalls"] == 0 and data["messagesSent"] == 0, data
    print(json.dumps({"optInChecks": 3, "realWindowCaptures": 0, "aiCalls": 0, "messagesSent": 0}))
