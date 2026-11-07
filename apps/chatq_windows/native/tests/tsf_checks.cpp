// Disposable CI VM only: registered COM service, process-local TSF activation and synthetic text store.
// No physical key injection, clipboard or user application is used.
#include "../ids.h"
#include <textstor.h>
#include <olectl.h>
#include <wrl/client.h>
#include <iostream>
#include <stdexcept>
#include <algorithm>
using Microsoft::WRL::ComPtr;
static int checks = 0;
static HWND fixtureWindow = nullptr;
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
  HRESULT STDMETHODCALLTYPE GetWnd(TsViewCookie, HWND* window) override { *window = fixtureWindow; return S_OK; }
  HRESULT STDMETHODCALLTYPE OnStartComposition(ITfCompositionView*, BOOL* ok) override { compositions++; *ok = TRUE; return S_OK; }
  HRESULT STDMETHODCALLTYPE OnUpdateComposition(ITfCompositionView*, ITfRange*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE OnEndComposition(ITfCompositionView*) override { compositions--; return S_OK; }
  void ClearFromApp() { LONG old = static_cast<LONG>(text.size()); text.clear(); start = end = 0; if (sink) { TS_TEXTCHANGE change{0,old,0}; sink->OnTextChange(0,&change); sink->OnSelectionChange(); } }
  void ReadOnly(bool value) { readonly = value; if (sink) sink->OnStatusChange(TS_SD_READONLY); }
};
static void Pump() { MSG msg; while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); } }
// Thread-local keyboard metadata only. Never SendInput, global hooks or physical keys.
struct LocalKeyboard {
  BYTE saved[256]{};
  LocalKeyboard(){Check(GetKeyboardState(saved)!=FALSE,"read fixture keyboard metadata");}
  ~LocalKeyboard(){SetKeyboardState(saved);}
  void State(bool shift=false,bool control=false,bool alt=false,bool caps=false){BYTE next[256]{};next[VK_SHIFT]=shift?0x80:0;next[VK_CONTROL]=control?0x80:0;next[VK_MENU]=alt?0x80:0;next[VK_CAPITAL]=caps?1:0;Check(SetKeyboardState(next)!=FALSE,"set process-local synthetic modifier metadata");}
};
int wmain(int argc, wchar_t** argv) {
  try {
    wchar_t ci[16]{}; GetEnvironmentVariableW(L"GITHUB_ACTIONS",ci,16); Check(wcscmp(ci,L"true")==0,"TSF integration test requires a disposable CI VM");
    Check(argc == 3 && wcscmp(argv[2],L"--registered")==0, "Installed DLL argument"); HR(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED), "COM");
    HMODULE dll = LoadLibraryW(argv[1]); Check(dll != nullptr, "load actual shipped DLL");
    auto factoryFunction = reinterpret_cast<HRESULT(STDAPICALLTYPE*)(REFCLSID,REFIID,void**)>(GetProcAddress(dll,"DllGetClassObject")); Check(factoryFunction != nullptr,"COM factory export");
    ComPtr<IClassFactory> factory; HR(factoryFunction(CLSID_ChatQ,IID_PPV_ARGS(&factory)),"factory");
    if (argc == 3 && wcscmp(argv[2], L"--registered") == 0) {
      ComPtr<ITfTextInputProcessorEx> registered; HR(CoCreateInstance(CLSID_ChatQ,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&registered)),"installed COM activation"); registered.Reset();
      ComPtr<ITfInputProcessorProfileMgr> profiles; HR(CoCreateInstance(CLSID_TF_InputProcessorProfiles,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&profiles)),"installed profiles");
      // The hosted VM has only English in its user input-language list. Read back
      // our persistent Chinese registration directly; do not equate enumeration of
      // the user's enabled languages with machine-wide installation.
      ComPtr<ITfInputProcessorProfiles> languages; HR(profiles.As(&languages),"language profile enumerator");
      BSTR description=nullptr;HR(languages->GetLanguageProfileDescription(CLSID_ChatQ,ChatQLanguage,PROFILE_ChatQ,&description),"installed Chinese profile description");
      bool named=description && wcscmp(description,ChatQName)==0;SysFreeString(description);Check(named,"installed Chinese profile name");
      ComPtr<ITfCategoryMgr> categories;HR(CoCreateInstance(CLSID_TF_CategoryMgr,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&categories)),"installed category manager");
      ComPtr<IEnumGUID> registeredCategories;HR(categories->EnumCategoriesInItem(CLSID_ChatQ,&registeredCategories),"registered categories");GUID category{};ULONG fetched=0;bool keyboard=false,tray=false;
      while(registeredCategories->Next(1,&category,&fetched)==S_OK && fetched==1) { if(category==GUID_TFCAT_TIP_KEYBOARD) keyboard=true; if(category==GUID_TFCAT_TIPCAP_SYSTRAYSUPPORT) tray=true; }
      Check(keyboard,"persistent keyboard category");Check(tray,"persistent language-bar capability");
    }
    WNDCLASSW wc{}; wc.hInstance=GetModuleHandleW(nullptr);wc.lpfnWndProc=DefWindowProcW;wc.lpszClassName=L"ChatQIsolatedTsfHost";RegisterClassW(&wc);fixtureWindow=CreateWindowW(wc.lpszClassName,L"ChatQ isolated synthetic TSF host",WS_OVERLAPPEDWINDOW,100,100,800,400,nullptr,nullptr,wc.hInstance,nullptr);Check(fixtureWindow!=nullptr,"synthetic host window");ShowWindow(fixtureWindow,SW_SHOWNORMAL);
    ComPtr<ITfThreadMgr> manager; HR(CoCreateInstance(CLSID_TF_ThreadMgr,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&manager)),"thread manager"); TfClientId client; HR(manager->Activate(&client),"activate manager");
    ComPtr<ITfDocumentMgr> document; HR(manager->CreateDocumentMgr(&document),"document");
    ComPtr<Store> store; store.Attach(new Store()); ComPtr<ITfContext> context; TfEditCookie cookie; HR(document->CreateContext(client,0,static_cast<ITextStoreACP*>(store.Get()),&context,&cookie),"context"); HR(document->Push(context.Get()),"push"); HR(manager->SetFocus(document.Get()),"focus");
    ComPtr<ITfDocumentMgr> previous; HR(manager->AssociateFocus(fixtureWindow,document.Get(),&previous),"associate synthetic focus"); SetFocus(fixtureWindow); SetForegroundWindow(fixtureWindow); Pump();
    ComPtr<ITfInputProcessorProfileMgr> activation; HR(CoCreateInstance(CLSID_TF_InputProcessorProfiles,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&activation)),"profile manager");
    LANGID localLanguage=LOWORD(reinterpret_cast<ULONG_PTR>(GetKeyboardLayout(0)));
    HR(activation->RegisterProfile(CLSID_ChatQ,localLanguage,PROFILE_ChatQ,ChatQName,static_cast<ULONG>(wcslen(ChatQName)),argv[1],static_cast<ULONG>(wcslen(argv[1])),0,nullptr,0,TRUE,TF_RP_LOCALPROCESS),"process-local test profile");
    HRESULT active=activation->ActivateProfile(TF_PROFILETYPE_INPUTPROCESSOR,localLanguage,CLSID_ChatQ,PROFILE_ChatQ,nullptr,TF_IPPMF_FORPROCESS);HR(active,"activate genuine TIP profile");Check(active==S_OK,"profile enabled");Pump();HR(manager->SetFocus(document.Get()),"focus activated context");
    TF_INPUTPROCESSORPROFILE profile{};HR(activation->GetProfile(TF_PROFILETYPE_INPUTPROCESSOR,localLanguage,CLSID_ChatQ,PROFILE_ChatQ,nullptr,&profile),"process-local activated profile");Check(profile.clsid==CLSID_ChatQ && profile.guidProfile==PROFILE_ChatQ,"activated profile identity");
    // GetProfile leaves catid null for a local-process-only profile; persistent
    // keyboard category was independently verified through ITfCategoryMgr above.
    ComPtr<ITfKeystrokeMgr> keys; HR(manager.As(&keys),"real keystroke manager");
    ComPtr<ITfLangBarItemMgr> barManager;HR(manager.As(&barManager),"language bar manager");ComPtr<ITfLangBarItem> barItem;HR(barManager->GetItem(GUID_LBI_INPUTMODE,&barItem),"active input-mode item");ComPtr<ITfLangBarItemButton> button;HR(barItem.As(&button),"language bar button");
    TF_LANGBARITEMINFO info{};HR(button->GetInfo(&info),"mode item identity");Check(info.clsidService==CLSID_ChatQ && info.guidItem==GUID_LBI_INPUTMODE,"standard input-mode identity");Check((info.dwStyle & TF_LBI_STYLE_TEXTCOLORICON)!=0,"system-colored monochrome icon style");
    auto modeIs = [&](const wchar_t* expected) { BSTR value=nullptr;HR(button->GetText(&value),"mode text");bool matches=value && wcscmp(value,expected)==0;SysFreeString(value);Check(matches,"mode text matches actual input mode"); };
    modeIs(L"中"); BSTR tip=nullptr;HR(button->GetTooltipString(&tip),"mode tooltip");Check(tip && wcsstr(tip,L"Ctrl+空格"),"tooltip includes mode shortcut");SysFreeString(tip);
    HICON icon=nullptr;HR(button->GetIcon(&icon),"mode icon");Check(icon!=nullptr,"icon owned by caller");ICONINFO pixels{};Check(GetIconInfo(icon,&pixels)!=FALSE && pixels.hbmMask && !pixels.hbmColor,"monochrome icon has transparency mask");if(pixels.hbmMask)DeleteObject(pixels.hbmMask);if(pixels.hbmColor)DeleteObject(pixels.hbmColor);DestroyIcon(icon);
    HR(button->OnClick(TF_LBI_CLK_LEFT,{},nullptr),"click English mode");modeIs(L"英");BOOL passed=TRUE;keys->TestKeyDown('N',0,&passed);Check(!passed,"clicked English mode passes letter keys to host");HR(button->OnClick(TF_LBI_CLK_LEFT,{},nullptr),"click Chinese mode");modeIs(L"中");
    auto key = [&](WPARAM code) { BOOL eaten = FALSE; HR(keys->TestKeyDown(code,0,&eaten),"test key"); Check(eaten != FALSE,"expected key handled"); HR(keys->KeyDown(code,0,&eaten),"key edit"); Check(eaten != FALSE,"edit succeeded"); Pump(); };
    auto type = [&](const wchar_t* value) { for (;*value;value++) key(*value >= L'a' && *value <= L'z' ? *value-L'a'+L'A' : *value); };
    type(L"nihao"); Check(store->text == L"nihao","real composition text"); key(VK_SPACE); Check(store->text == L"你好","real TSF candidate commit");
    type(L"xiexie"); key(VK_SPACE); Check(store->text == L"你好谢谢","subsequent composition appends");
    store->ClearFromApp();type(L"jintianyoukongma");key(VK_SPACE);Check(store->text==L"今天有空吗","full chat phrase commits through actual TSF edit");
    store->ClearFromApp();type(L"wzdl");key(VK_SPACE);Check(store->text==L"我知道了","chat initials commit the shared phrase");
    store->ClearFromApp();type(L"haodemeiwenti");key(VK_BACK);type(L"i");key(VK_SPACE);Check(store->text==L"好的没问题","phrase survives backspace and retyping");
    store->ClearFromApp();type(L"haodewozhidaole");HWND phraseWindow=FindWindowW(L"ChatQCandidateWindowV1",nullptr);RECT phraseBounds{};
    Check(phraseWindow && GetClientRect(phraseWindow,&phraseBounds) && phraseBounds.bottom>MulDiv(124,GetDpiForWindow(phraseWindow),96),"long phrase gets a full-width preview row");
    key(VK_SPACE);Check(store->text==L"好的我知道了","previewed phrase commits exactly once");
    store->ClearFromApp(); type(L"nihao"); key(VK_BACK); Check(store->text == L"niha","backspace composition"); key(VK_ESCAPE); Check(store->text.empty(),"cancel removes only composition");
    type(L"nihao"); key(VK_RETURN); Check(store->text == L"nihao","enter confirms literal pinyin"); BOOL eaten = TRUE; HR(keys->TestKeyDown(VK_RETURN,0,&eaten),"second enter"); Check(!eaten,"second enter left to host");
    store->ClearFromApp(); type(L"zhongguo"); key(VK_RIGHT); key(VK_LEFT); key(VK_NEXT); key(VK_PRIOR); key(VK_SPACE); Check(store->text == L"中国","candidate navigation and page");
    store->ClearFromApp(); type(L"nihao"); key(VK_OEM_PERIOD); Check(store->text == L"你好。","Chinese punctuation commit");
    store->ClearFromApp();type(L"nihao");HR(button->OnClick(TF_LBI_CLK_LEFT,{},nullptr),"mode click confirms pending raw spelling");Check(store->text==L"nihao" && store->compositions==0,"switching mode preserves pending letters and ends composition");modeIs(L"英");HR(button->OnClick(TF_LBI_CLK_LEFT,{},nullptr),"resume Chinese mode");modeIs(L"中");
    store->ClearFromApp(); store->ReadOnly(true); eaten=TRUE; HR(keys->TestKeyDown('N',0,&eaten),"readonly"); Check(!eaten,"read-only ignores input"); store->ReadOnly(false);
    ComPtr<ITfCompartmentMgr> cm; HR(context.As(&cm),"compartment manager"); ComPtr<ITfCompartment> disabled; HR(cm->GetCompartment(GUID_COMPARTMENT_KEYBOARD_DISABLED,&disabled),"disabled compartment"); VARIANT v; VariantInit(&v); v.vt=VT_I4;v.lVal=1;HR(disabled->SetValue(client,&v),"disable");eaten=TRUE;keys->TestKeyDown('N',0,&eaten);Check(!eaten,"disabled/password context ignores input");v.lVal=0;disabled->SetValue(client,&v);
    ComPtr<ITfKeyEventSink> eventSink;HR(button.As(&eventSink),"actual input-mode key sink");LocalKeyboard keyboard;keyboard.State();
    auto shiftDown=[&](){keyboard.State(true);BOOL handled=TRUE;HR(eventSink->OnTestKeyDown(context.Get(),VK_SHIFT,0,&handled),"observe Shift press");Check(!handled,"Shift press remains available for native combinations");};
    auto shiftUp=[&](bool expected){keyboard.State();BOOL handled=FALSE;HR(eventSink->OnTestKeyUp(context.Get(),VK_SHIFT,0,&handled),"test Shift release");Check(handled==expected,"only a standalone Shift release toggles");if(handled){HR(eventSink->OnKeyUp(context.Get(),VK_SHIFT,0,&handled),"release Shift");Check(handled,"Shift toggle applied");}};
    auto controlSpace=[&](bool releaseControlFirst){
      keyboard.State(false,true);BOOL handled=FALSE;HR(eventSink->OnTestKeyDown(context.Get(),VK_SPACE,0,&handled),"test Ctrl+Space press");Check(handled,"Ctrl+Space captured without literal space");HR(eventSink->OnKeyDown(context.Get(),VK_SPACE,0,&handled),"press Ctrl+Space");
      HR(eventSink->OnKeyDown(context.Get(),VK_SPACE,1LL<<30,&handled),"held Ctrl+Space repeat");Check(handled,"held shortcut stays consumed");
      if(releaseControlFirst){keyboard.State();HR(eventSink->OnKeyUp(context.Get(),VK_CONTROL,0,&handled),"early Ctrl release");HR(eventSink->OnKeyUp(context.Get(),VK_SPACE,0,&handled),"fallback Space release");}
      else{HR(keys->SimulatePreservedKey(context.Get(),KEY_Toggle,&handled),"registered Ctrl+Space release");}
      Check(handled,"Ctrl+Space toggles once on either release order");keyboard.State();
    };
    controlSpace(false);modeIs(L"英");eaten=TRUE;keys->TestKeyDown('N',0,&eaten);Check(!eaten,"English mode passes through");controlSpace(true);modeIs(L"中");
    shiftDown();shiftUp(true);modeIs(L"英");shiftDown();shiftUp(true);modeIs(L"中");
    store->ClearFromApp();type(L"nihao");shiftDown();shiftUp(true);modeIs(L"英");Check(store->text==L"nihao"&&store->compositions==0,"Shift switch confirms pending spelling once");shiftDown();shiftUp(true);modeIs(L"中");
    store->ClearFromApp();type(L"ni");shiftDown();eaten=FALSE;HR(eventSink->OnTestKeyDown(context.Get(),'A',0,&eaten),"uppercase boundary test");Check(eaten,"pending Pinyin is settled before uppercase passes through");HR(eventSink->OnKeyDown(context.Get(),'A',0,&eaten),"uppercase boundary edit");Check(!eaten&&store->text==L"ni"&&store->compositions==0,"uppercase stays native and leaves no stale composition");shiftUp(false);modeIs(L"中");
    store->ClearFromApp();shiftDown();eaten=TRUE;HR(eventSink->OnTestKeyDown(context.Get(),VK_LEFT,0,&eaten),"Shift+Left");Check(!eaten,"native selection shortcut passes through");shiftUp(false);modeIs(L"中");
    shiftDown();HR(eventSink->OnSetFocus(FALSE),"lose focus while Shift is held");shiftUp(false);modeIs(L"中");
    keyboard.State(true,true);eaten=TRUE;eventSink->OnTestKeyDown(context.Get(),VK_SHIFT,0,&eaten);keyboard.State();shiftUp(false);modeIs(L"中");
    store->ReadOnly(true);shiftDown();shiftUp(false);keyboard.State(false,true);eaten=TRUE;eventSink->OnTestKeyDown(context.Get(),VK_SPACE,0,&eaten);Check(!eaten,"readonly context refuses mode shortcut");keys->SimulatePreservedKey(context.Get(),KEY_Toggle,&eaten);Check(!eaten,"preserved shortcut cannot change a readonly editor");store->ReadOnly(false);keyboard.State();modeIs(L"中");
    keyboard.State(false,false,false,true);modeIs(L"A");eaten=TRUE;eventSink->OnTestKeyDown(context.Get(),'N',0,&eaten);Check(!eaten,"Caps Lock letters stay native with an accurate A indicator");keyboard.State();eventSink->OnTestKeyUp(context.Get(),VK_CAPITAL,0,&eaten);modeIs(L"中");
    eventSink.Reset();
    type(L"nihao"); ComPtr<ITfDocumentMgr> other;HR(manager->CreateDocumentMgr(&other),"other doc");HR(manager->SetFocus(other.Get()),"switch context");Pump();Check(store->text.empty(),"context switch discards old composition");
    Check(store->compositions==0,"all synthetic compositions ended");
    HR(activation->DeactivateProfile(TF_PROFILETYPE_INPUTPROCESSOR,localLanguage,CLSID_ChatQ,PROFILE_ChatQ,nullptr,TF_IPPMF_FORPROCESS),"deactivate genuine TIP");
    DWORD modeStatus=0;HR(button->GetStatus(&modeStatus),"inactive mode item");Check((modeStatus & TF_LBI_STATUS_DISABLED)!=0,"inactive mode item disabled");button.Reset();barItem.Reset();barManager.Reset();
    // TSF may cache a deactivated processor. Explicitly release its instance,
    // then end COM before asserting that the manually loaded DLL can unload.
    HR(activation->ReleaseInputProcessor(CLSID_ChatQ,0),"release cached input processor");activation.Reset();keys.Reset();factory.Reset();document->Pop(TF_POPF_ALL);context.Reset();document.Reset();store.Reset();other.Reset();ComPtr<ITfDocumentMgr> displaced;manager->AssociateFocus(fixtureWindow,previous.Get(),&displaced);displaced.Reset();disabled.Reset();cm.Reset();previous.Reset();manager->SetFocus(nullptr);manager->Deactivate();manager.Reset();Pump();DestroyWindow(fixtureWindow);CoFreeUnusedLibrariesEx(0,0);CoUninitialize();
    auto unload=reinterpret_cast<HRESULT(STDAPICALLTYPE*)()>(GetProcAddress(dll,"DllCanUnloadNow"));Check(unload && unload()==S_OK,"COM instances and sinks released");FreeLibrary(dll);
    std::cout << "PASS " << checks << " real-TSF synthetic checks; process-local activation in disposable VM; no physical key injection, clipboard or user chat\n"; return 0;
  } catch(const std::exception& error) { std::cerr << "FAIL: " << error.what() << "\n"; return 1; }
}
