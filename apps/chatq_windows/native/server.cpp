#include "ids.h"
#include <wrl/client.h>
#include <shlwapi.h>
#include <string>
using Microsoft::WRL::ComPtr;
HINSTANCE g_instance = nullptr;
LONG g_objects = 0;
class Factory final : public IClassFactory {
  LONG refs = 1;
public:
  Factory() { InterlockedIncrement(&g_objects); }
  ~Factory() { InterlockedDecrement(&g_objects); }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** out) override { if (!out) return E_POINTER; *out = nullptr; if (id == IID_IUnknown || id == IID_IClassFactory) { *out = static_cast<IClassFactory*>(this); AddRef(); return S_OK; } return E_NOINTERFACE; }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs); }
  ULONG STDMETHODCALLTYPE Release() override { ULONG n = InterlockedDecrement(&refs); if (!n) delete this; return n; }
  HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* outer, REFIID id, void** out) override { if (outer) return CLASS_E_NOAGGREGATION; return CreateService(id, out); }
  HRESULT STDMETHODCALLTYPE LockServer(BOOL lock) override { if (lock) InterlockedIncrement(&g_objects); else InterlockedDecrement(&g_objects); return S_OK; }
};
BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, void*) { if (reason == DLL_PROCESS_ATTACH) g_instance = instance; return TRUE; }
STDAPI DllCanUnloadNow() { if (InterlockedCompareExchange(&g_objects, 0, 0) != 0) return S_FALSE; UnregisterClassW(L"ChatQCandidateWindowV1", g_instance); return S_OK; }
STDAPI DllGetClassObject(REFCLSID clsid, REFIID id, void** out) { if (clsid != CLSID_ChatQ) return CLASS_E_CLASSNOTAVAILABLE; auto factory = new Factory(); HRESULT hr = factory->QueryInterface(id, out); factory->Release(); return hr; }
static std::wstring ClassKey() { wchar_t guid[40]; StringFromGUID2(CLSID_ChatQ, guid, 40); return std::wstring(L"Software\\Classes\\CLSID\\") + guid; }
STDAPI DllRegisterServer() {
  wchar_t path[32768]; DWORD length = GetModuleFileNameW(g_instance, path, 32768); if (!length || length >= 32768) return E_FAIL;
  HKEY key; const auto base = ClassKey();
  LONG error = RegCreateKeyExW(HKEY_LOCAL_MACHINE, (base + L"\\InprocServer32").c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr);
  if (error != ERROR_SUCCESS) return HRESULT_FROM_WIN32(error);
  error = RegSetValueExW(key, nullptr, 0, REG_SZ, reinterpret_cast<BYTE*>(path), (length + 1) * sizeof(wchar_t));
  const wchar_t threading[] = L"Apartment"; if (error == ERROR_SUCCESS) error = RegSetValueExW(key, L"ThreadingModel", 0, REG_SZ, reinterpret_cast<const BYTE*>(threading), sizeof(threading)); RegCloseKey(key);
  if (error != ERROR_SUCCESS) return HRESULT_FROM_WIN32(error);
  HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  ComPtr<ITfInputProcessorProfileMgr> profiles; HRESULT hr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&profiles));
  if (SUCCEEDED(hr)) hr = profiles->RegisterProfile(CLSID_ChatQ, ChatQLanguage, PROFILE_ChatQ, ChatQName, static_cast<ULONG>(wcslen(ChatQName)), path, length, 0, nullptr, 0, TRUE, 0);
  ComPtr<ITfCategoryMgr> categories;
  if (SUCCEEDED(hr)) hr = CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&categories));
  if (SUCCEEDED(hr)) hr = categories->RegisterCategory(CLSID_ChatQ, GUID_TFCAT_TIP_KEYBOARD, CLSID_ChatQ);
  if (FAILED(hr)) { if (profiles) profiles->UnregisterProfile(CLSID_ChatQ, ChatQLanguage, PROFILE_ChatQ, 0); RegDeleteTreeW(HKEY_LOCAL_MACHINE, base.c_str()); }
  categories.Reset(); profiles.Reset(); if (SUCCEEDED(initialized)) CoUninitialize(); return hr;
}
STDAPI DllUnregisterServer() {
  HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  ComPtr<ITfInputProcessorProfileMgr> profiles; HRESULT hr = CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&profiles));
  if (SUCCEEDED(hr)) hr = profiles->UnregisterProfile(CLSID_ChatQ, ChatQLanguage, PROFILE_ChatQ, 0);
  ComPtr<ITfCategoryMgr> categories; if (SUCCEEDED(CoCreateInstance(CLSID_TF_CategoryMgr, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&categories)))) categories->UnregisterCategory(CLSID_ChatQ, GUID_TFCAT_TIP_KEYBOARD, CLSID_ChatQ);
  // UnregisterProfile removes only the language profile, not the processor's
  // own persistent TIP root. Remove the processor as well, then clean only our
  // stable identity so repeated x86/x64 unregistration is idempotent.
  ComPtr<ITfInputProcessorProfiles> legacy;
  if (SUCCEEDED(CoCreateInstance(CLSID_TF_InputProcessorProfiles, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&legacy)))) legacy->Unregister(CLSID_ChatQ);
  wchar_t guid[40]{}; StringFromGUID2(CLSID_ChatQ, guid, 40);
  LONG tipRemoved = RegDeleteTreeW(HKEY_LOCAL_MACHINE, (std::wstring(L"Software\\Microsoft\\CTF\\TIP\\") + guid).c_str());
  LONG removed = RegDeleteTreeW(HKEY_LOCAL_MACHINE, ClassKey().c_str());
  legacy.Reset(); categories.Reset(); profiles.Reset();
  if (SUCCEEDED(initialized)) CoUninitialize();
  if (tipRemoved != ERROR_SUCCESS && tipRemoved != ERROR_FILE_NOT_FOUND) return HRESULT_FROM_WIN32(tipRemoved);
  return removed == ERROR_SUCCESS || removed == ERROR_FILE_NOT_FOUND ? S_OK : HRESULT_FROM_WIN32(removed);
}
