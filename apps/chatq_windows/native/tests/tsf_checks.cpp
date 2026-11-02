// Real TSF manager and edit sessions, backed ONLY by an in-memory synthetic text store.
// No global IME registration, physical key injection, clipboard or user application is used.
#include "../ids.h"
#include <textstor.h>
#include <olectl.h>
#include <wrl/client.h>
#include <iostream>
#include <stdexcept>
#include <algorithm>
using Microsoft::WRL::ComPtr;
static int checks = 0;
static void Check(bool condition, const char* name) { if (!condition) throw std::runtime_error(name); checks++; }
static void HR(HRESULT value, const char* name) { if (FAILED(value)) { std::cerr << name << ": 0x" << std::hex << value << std::dec << "\n"; throw std::runtime_error(name); } }
class Store final : public ITextStoreACP, public ITfContextOwnerCompositionSink {
  LONG refs = 1; ComPtr<ITextStoreACPSink> sink; DWORD lock = 0, pending = 0;
public:
  std::wstring text; LONG start = 0, end = 0; bool readonly = false; int compositions = 0;
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** out) override { *out = nullptr; if (id == IID_IUnknown || id == IID_ITextStoreACP) *out = static_cast<ITextStoreACP*>(this); else if (id == IID_ITfContextOwnerCompositionSink) *out = static_cast<ITfContextOwnerCompositionSink*>(this); if (*out) { AddRef(); return S_OK; } return E_NOINTERFACE; }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs); }
  ULONG STDMETHODCALLTYPE Release() override { ULONG n = InterlockedDecrement(&refs); if (!n) delete this; return n; }
  HRESULT STDMETHODCALLTYPE AdviseSink(REFIID id, IUnknown* value, DWORD) override { if (id != IID_ITextStoreACPSink) return E_INVALIDARG; if (sink) return CONNECT_E_ADVISELIMIT; return value->QueryInterface(IID_PPV_ARGS(&sink)); }
  HRESULT STDMETHODCALLTYPE UnadviseSink(IUnknown*) override { sink.Reset(); return S_OK; }
  HRESULT STDMETHODCALLTYPE RequestLock(DWORD flags, HRESULT* result) override {
    if (!sink) return E_UNEXPECTED;
    if (lock) { if (flags & TS_LF_SYNC) *result = TS_E_SYNCHRONOUS; else { pending |= flags; *result = TS_S_ASYNC; } return S_OK; }
    lock = flags; *result = sink->OnLockGranted(flags); lock = 0;
    while (pending) { lock = pending; pending = 0; sink->OnLockGranted(lock); lock = 0; } return S_OK;
  }
  HRESULT STDMETHODCALLTYPE GetStatus(TS_STATUS* status) override { status->dwDynamicFlags = readonly ? TS_SD_READONLY : 0; status->dwStaticFlags = 0; return S_OK; }
  HRESULT STDMETHODCALLTYPE QueryInsert(LONG a, LONG b, ULONG, LONG* outA, LONG* outB) override { if (a < 0 || b < a || b > static_cast<LONG>(text.size())) return TS_E_INVALIDPOS; *outA = a; *outB = b; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetSelection(ULONG index, ULONG count, TS_SELECTION_ACP* selection, ULONG* fetched) override { if (!count || (index != 0 && index != TS_DEFAULT_SELECTION)) return E_INVALIDARG; *fetched = 1; selection[0] = { start, end, { TS_AE_END, FALSE } }; return S_OK; }
  HRESULT STDMETHODCALLTYPE SetSelection(ULONG count, const TS_SELECTION_ACP* selection) override { if (count != 1 || selection[0].acpStart < 0 || selection[0].acpEnd > static_cast<LONG>(text.size())) return TS_E_INVALIDPOS; start = selection[0].acpStart; end = selection[0].acpEnd; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetText(LONG a, LONG b, WCHAR* plain, ULONG capacity, ULONG* actual, TS_RUNINFO* runs, ULONG runCapacity, ULONG* runCount, LONG* next) override {
    if (b == -1) b = static_cast<LONG>(text.size()); if (a < 0 || b < a || b > static_cast<LONG>(text.size())) return TS_E_INVALIDPOS;
    ULONG count = std::min(capacity, static_cast<ULONG>(b - a)); if (plain && count) std::copy_n(text.data() + a, count, plain); if (actual) *actual = count;
    if (runCount) { *runCount = runCapacity && b > a ? 1 : 0; if (*runCount) runs[0] = { count ? count : static_cast<ULONG>(b - a), TS_RT_PLAIN }; }
    if (next) *next = a + count; return S_OK;
  }
  HRESULT STDMETHODCALLTYPE SetText(DWORD, LONG a, LONG b, const WCHAR* value, ULONG count, TS_TEXTCHANGE* change) override { if (readonly) return TS_E_READONLY; if (a < 0 || b < a || b > static_cast<LONG>(text.size())) return TS_E_INVALIDPOS; text.replace(a, b-a, value, count); if (change) *change = { a, b, a + static_cast<LONG>(count) }; start = end = a + count; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetFormattedText(LONG, LONG, IDataObject**) override { return E_NOTIMPL; }
  HRESULT STDMETHODCALLTYPE GetEmbedded(LONG, REFGUID, REFIID, IUnknown**) override { return E_NOTIMPL; }
  HRESULT STDMETHODCALLTYPE QueryInsertEmbedded(const GUID*, const FORMATETC*, BOOL* insertable) override { *insertable = FALSE; return S_OK; }
  HRESULT STDMETHODCALLTYPE InsertEmbedded(DWORD, LONG, LONG, IDataObject*, TS_TEXTCHANGE*) override { return E_NOTIMPL; }
  HRESULT STDMETHODCALLTYPE InsertTextAtSelection(DWORD flags, const WCHAR* value, ULONG count, LONG* a, LONG* b, TS_TEXTCHANGE* change) override { if (a) *a = start; if (b) *b = end; if (flags & TS_IAS_QUERYONLY) return S_OK; LONG initial = start; HRESULT hr = SetText(0, start, end, value, count, change); if (b) *b = initial + count; return hr; }
  HRESULT STDMETHODCALLTYPE InsertEmbeddedAtSelection(DWORD, IDataObject*, LONG*, LONG*, TS_TEXTCHANGE*) override { return E_NOTIMPL; }
  HRESULT STDMETHODCALLTYPE RequestSupportedAttrs(DWORD, ULONG, const TS_ATTRID*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE RequestAttrsAtPosition(LONG, ULONG, const TS_ATTRID*, DWORD) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE RequestAttrsTransitioningAtPosition(LONG, ULONG, const TS_ATTRID*, DWORD) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE FindNextAttrTransition(LONG, LONG halt, ULONG, const TS_ATTRID*, DWORD, LONG* next, BOOL* found, LONG* offset) override { *next = halt; *found = FALSE; *offset = 0; return S_OK; }
  HRESULT STDMETHODCALLTYPE RetrieveRequestedAttrs(ULONG, TS_ATTRVAL*, ULONG* count) override { *count = 0; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetEndACP(LONG* value) override { *value = static_cast<LONG>(text.size()); return S_OK; }
  HRESULT STDMETHODCALLTYPE GetActiveView(TsViewCookie* view) override { *view = 0; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetACPFromPoint(TsViewCookie, const POINT*, DWORD, LONG* value) override { *value = start; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetTextExt(TsViewCookie, LONG a, LONG b, RECT* rect, BOOL* clipped) override { *rect = { 100+a*8, 100, 100+std::max(a+1,b)*8, 120 }; *clipped = FALSE; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetScreenExt(TsViewCookie, RECT* rect) override { *rect = { 0,0,1000,800 }; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetWnd(TsViewCookie, HWND* window) override { *window = GetDesktopWindow(); return S_OK; }
  HRESULT STDMETHODCALLTYPE OnStartComposition(ITfCompositionView*, BOOL* ok) override { compositions++; *ok = TRUE; return S_OK; }
  HRESULT STDMETHODCALLTYPE OnUpdateComposition(ITfCompositionView*, ITfRange*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE OnEndComposition(ITfCompositionView*) override { compositions--; return S_OK; }
  void ClearFromApp() { LONG old = static_cast<LONG>(text.size()); text.clear(); start = end = 0; if (sink) { TS_TEXTCHANGE change{0,old,0}; sink->OnTextChange(0,&change); sink->OnSelectionChange(); } }
  void ReadOnly(bool value) { readonly = value; if (sink) sink->OnStatusChange(TS_SD_READONLY); }
};
static void Pump() { MSG msg; while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); } }
int wmain(int argc, wchar_t** argv) {
  try {
    Check(argc == 2, "DLL argument"); HR(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED), "COM");
    HMODULE dll = LoadLibraryW(argv[1]); Check(dll != nullptr, "load actual shipped DLL");
    auto factoryFunction = reinterpret_cast<HRESULT(STDAPICALLTYPE*)(REFCLSID,REFIID,void**)>(GetProcAddress(dll,"DllGetClassObject")); Check(factoryFunction != nullptr,"COM factory export");
    ComPtr<IClassFactory> factory; HR(factoryFunction(CLSID_ChatQ,IID_PPV_ARGS(&factory)),"factory");
    ComPtr<ITfTextInputProcessorEx> service; HR(factory->CreateInstance(nullptr,IID_PPV_ARGS(&service)),"service");
    ComPtr<ITfThreadMgr> manager; HR(CoCreateInstance(CLSID_TF_ThreadMgr,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&manager)),"thread manager"); TfClientId client; HR(manager->Activate(&client),"activate manager");
    ComPtr<ITfDocumentMgr> document; HR(manager->CreateDocumentMgr(&document),"document");
    ComPtr<Store> store; store.Attach(new Store()); ComPtr<ITfContext> context; TfEditCookie cookie; HR(document->CreateContext(client,0,static_cast<ITextStoreACP*>(store.Get()),&context,&cookie),"context"); HR(document->Push(context.Get()),"push"); HR(manager->SetFocus(document.Get()),"focus");
    HR(service->ActivateEx(manager.Get(),client,0),"activate text service"); ComPtr<ITfKeyEventSink> keys; HR(service.As(&keys),"key sink");
    auto key = [&](WPARAM code) { BOOL eaten = FALSE; HR(keys->OnTestKeyDown(context.Get(),code,0,&eaten),"test key"); Check(eaten != FALSE,"expected key handled"); HR(keys->OnKeyDown(context.Get(),code,0,&eaten),"key edit"); Check(eaten != FALSE,"edit succeeded"); Pump(); };
    auto type = [&](const wchar_t* value) { for (;*value;value++) key(*value >= L'a' && *value <= L'z' ? *value-L'a'+L'A' : *value); };
    type(L"nihao"); Check(store->text == L"nihao","real composition text"); key(VK_SPACE); Check(store->text == L"你好","real TSF candidate commit");
    type(L"xiexie"); key(VK_SPACE); Check(store->text == L"你好谢谢","subsequent composition appends");
    store->ClearFromApp(); type(L"nihao"); key(VK_BACK); Check(store->text == L"niha","backspace composition"); key(VK_ESCAPE); Check(store->text.empty(),"cancel removes only composition");
    type(L"nihao"); key(VK_RETURN); Check(store->text == L"nihao","enter confirms literal pinyin"); BOOL eaten = TRUE; HR(keys->OnTestKeyDown(context.Get(),VK_RETURN,0,&eaten),"second enter"); Check(!eaten,"second enter left to host");
    store->ClearFromApp(); type(L"zhongguo"); key(VK_RIGHT); key(VK_LEFT); key(VK_NEXT); key(VK_PRIOR); key(VK_SPACE); Check(store->text == L"中国","candidate navigation and page");
    store->ClearFromApp(); type(L"nihao"); key(VK_OEM_PERIOD); Check(store->text == L"你好。","Chinese punctuation commit");
    store->ClearFromApp(); store->ReadOnly(true); eaten=TRUE; HR(keys->OnTestKeyDown(context.Get(),'N',0,&eaten),"readonly"); Check(!eaten,"read-only ignores input"); store->ReadOnly(false);
    ComPtr<ITfCompartmentMgr> cm; HR(context.As(&cm),"compartment manager"); ComPtr<ITfCompartment> disabled; HR(cm->GetCompartment(GUID_COMPARTMENT_KEYBOARD_DISABLED,&disabled),"disabled compartment"); VARIANT v; VariantInit(&v); v.vt=VT_I4;v.lVal=1;HR(disabled->SetValue(client,&v),"disable");eaten=TRUE;keys->OnTestKeyDown(context.Get(),'N',0,&eaten);Check(!eaten,"disabled/password context ignores input");v.lVal=0;disabled->SetValue(client,&v);
    keys->OnPreservedKey(context.Get(),KEY_Toggle,&eaten);eaten=TRUE;keys->OnTestKeyDown(context.Get(),'N',0,&eaten);Check(!eaten,"English mode passes through");keys->OnPreservedKey(context.Get(),KEY_Toggle,&eaten);
    type(L"nihao"); ComPtr<ITfDocumentMgr> other;HR(manager->CreateDocumentMgr(&other),"other doc");HR(manager->SetFocus(other.Get()),"switch context");Pump();Check(store->text.empty(),"context switch discards old composition");
    HR(service->Deactivate(),"deactivate"); keys.Reset(); service.Reset(); factory.Reset(); document->Pop(TF_POPF_ALL);context.Reset();document.Reset();store.Reset();other.Reset();manager->Deactivate();manager.Reset();disabled.Reset();cm.Reset(); Pump();
    auto unload=reinterpret_cast<HRESULT(STDAPICALLTYPE*)()>(GetProcAddress(dll,"DllCanUnloadNow"));Check(unload && unload()==S_OK,"COM instances and sinks released"); FreeLibrary(dll);CoUninitialize();
    std::cout << "PASS " << checks << " real-TSF synthetic checks; no registry, physical key injection, clipboard or user chat\n"; return 0;
  } catch(const std::exception& error) { std::cerr << "FAIL: " << error.what() << "\n"; return 1; }
}
