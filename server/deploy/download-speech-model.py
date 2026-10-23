"""Download the pinned multilingual model; never use an unverified partial file."""
import hashlib
import pathlib
import urllib.request

destination = pathlib.Path('/opt/chatq/speech-models')
destination.mkdir(parents=True, exist_ok=True)
name = 'ggml-base-q5_1.bin'
expected = '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
target = destination / name
temporary = destination / (name + '.part')
if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
    urllib.request.urlretrieve('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/' + name, temporary)
    if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
        temporary.unlink(missing_ok=True)
        raise RuntimeError('Speech model checksum mismatch')
    temporary.replace(target)
print('Verified', name, expected)
