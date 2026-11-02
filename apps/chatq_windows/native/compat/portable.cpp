#include <windows.h>
#include <stdio.h>
#include <io.h>
#include <fcntl.h>
#include <string>
#include <cstdarg>
static std::wstring wide(const char* value) {
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value, -1, nullptr, 0);
  if (!n) return {};
  std::wstring result(n, L'\0'); MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value, -1, result.data(), n); result.resize(n - 1); return result;
}
FILE* chatq_fopen(const char* path, const char* mode) {
  auto p = wide(path), m = wide(mode); if (p.empty() || m.empty()) return nullptr;
  // The dictionary is a binary format. Windows text translation must never change its bytes.
  if (m.find(L'b') == std::wstring::npos) m += L"b";
  return _wfopen(p.c_str(), m.c_str());
}
int chatq_open(const char* path, int flags, ...) {
  auto p = wide(path); if (p.empty()) return -1;
  int mode = 0; if (flags & _O_CREAT) { va_list args; va_start(args, flags); mode = va_arg(args, int); va_end(args); }
  return _wopen(p.c_str(), flags | _O_BINARY, mode);
}
int chatq_unlink(const char* path) { auto p = wide(path); return p.empty() ? -1 : _wunlink(p.c_str()); }
