#include "ids.h"
#include "chatq_decoder.h"
#include <wrl/client.h>
#include <initguid.h>
#include <inputscope.h>
#include <shellapi.h>
#include <algorithm>
#include <functional>
#include <mutex>
#include <string>
#include <vector>
using Microsoft::WRL::ComPtr;

static std::string Utf8(const std::wstring& value) {
  int n = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (!n) return {}; std::string result(n, 0); WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), n, nullptr, nullptr); return result;
}
static std::wstring ModuleDirectory() { wchar_t path[32768]; DWORD n = GetModuleFileNameW(g_instance, path, 32768); if (!n || n >= 32768) return {}; std::wstring value(path, n); return value.substr(0, value.find_last_of(L"\\/")); }
static std::vector<chatq::Candidate> Decode(const std::wstring& spelling) {
  static std::mutex mutex; static bool loaded = false; static std::string dictionary;
  std::lock_guard<std::mutex> lock(mutex);
  if (!loaded) {
    dictionary = Utf8(ModuleDirectory() + L"\\dict_pinyin.dat");
    wchar_t temporary[MAX_PATH]; if (!GetTempPathW(MAX_PATH, temporary)) return {};
    std::wstring file = std::wstring(temporary) + L"ChatQ-empty-pinyin-" + std::to_wstring(GetCurrentProcessId()) + L".dict";
    loaded = chatq::open(dictionary, Utf8(file));
  }
  return loaded ? chatq::decode(Utf8(spelling)) : std::vector<chatq::Candidate>();
}
static bool CompartmentBool(ITfContext* context, REFGUID id) {
  ComPtr<ITfCompartmentMgr> manager; ComPtr<ITfCompartment> compartment;
  if (FAILED(context->QueryInterface(IID_PPV_ARGS(&manager))) || FAILED(manager->GetCompartment(id, &compartment))) return false;
  VARIANT value; VariantInit(&value); bool result = SUCCEEDED(compartment->GetValue(&value)) && value.vt == VT_I4 && value.lVal != 0; VariantClear(&value); return result;
}
static void OpenAssistant() {
  // The helper receives no editor text or clipboard data. Users explicitly paste in its UI.
  wchar_t path[32768]; DWORD size = sizeof(path);
  if (RegGetValueW(HKEY_LOCAL_MACHINE, L"Software\\ChatQWindows", L"AssistantPath", RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY, nullptr, path, &size) == ERROR_SUCCESS)
    ShellExecuteW(nullptr, L"open", path, L"--reply", nullptr, SW_SHOWNORMAL);
}
class Edit final : public ITfEditSession {
  LONG refs = 1; std::function<HRESULT(TfEditCookie)> action;
public:
  explicit Edit(std::function<HRESULT(TfEditCookie)> work) : action(std::move(work)) { InterlockedIncrement(&g_objects); }
  ~Edit() { InterlockedDecrement(&g_objects); }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** out) override { if (!out) return E_POINTER; *out = nullptr; if (id == IID_IUnknown || id == IID_ITfEditSession) { *out = static_cast<ITfEditSession*>(this); AddRef(); return S_OK; } return E_NOINTERFACE; }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs); }
  ULONG STDMETHODCALLTYPE Release() override { ULONG n = InterlockedDecrement(&refs); if (!n) delete this; return n; }
  HRESULT STDMETHODCALLTYPE DoEditSession(TfEditCookie ec) override { try { return action(ec); } catch (...) { return E_FAIL; } }
};

class Service final : public ITfTextInputProcessorEx, public ITfKeyEventSink, public ITfCompositionSink,
                      public ITfThreadMgrEventSink, public ITfTextEditSink {
  LONG refs = 1; TfClientId client = TF_CLIENTID_NULL; DWORD threadCookie = TF_INVALID_COOKIE, editCookie = TF_INVALID_COOKIE;
  ComPtr<ITfThreadMgr> manager; ComPtr<ITfContext> context; ComPtr<ITfComposition> composition; ComPtr<ITfSource> editSource;
  std::wstring spelling; std::vector<chatq::Candidate> candidates; size_t highlight = 0;
  HWND window = nullptr; std::vector<RECT> hitRects; RECT aiRect{}; RECT anchor{}; int dpi = 96; bool chinese = true; unsigned generation = 0;
public:
  Service() { InterlockedIncrement(&g_objects); }
  ~Service() { if (window) DestroyWindow(window); InterlockedDecrement(&g_objects); }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** out) override {
    if (!out) return E_POINTER; *out = nullptr;
    if (id == IID_IUnknown || id == IID_ITfTextInputProcessor || id == IID_ITfTextInputProcessorEx) *out = static_cast<ITfTextInputProcessorEx*>(this);
    else if (id == IID_ITfKeyEventSink) *out = static_cast<ITfKeyEventSink*>(this);
    else if (id == IID_ITfCompositionSink) *out = static_cast<ITfCompositionSink*>(this);
    else if (id == IID_ITfThreadMgrEventSink) *out = static_cast<ITfThreadMgrEventSink*>(this);
    else if (id == IID_ITfTextEditSink) *out = static_cast<ITfTextEditSink*>(this);
    if (!*out) return E_NOINTERFACE; AddRef(); return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs); }
  ULONG STDMETHODCALLTYPE Release() override { ULONG n = InterlockedDecrement(&refs); if (!n) delete this; return n; }
  HRESULT STDMETHODCALLTYPE Activate(ITfThreadMgr* tm, TfClientId id) override { return ActivateEx(tm, id, 0); }
  HRESULT STDMETHODCALLTYPE ActivateEx(ITfThreadMgr* tm, TfClientId id, DWORD) override {
    if (!tm || manager) return E_INVALIDARG; manager = tm; client = id;
    ComPtr<ITfKeystrokeMgr> keys; HRESULT hr = manager.As(&keys);
    if (SUCCEEDED(hr)) hr = keys->AdviseKeyEventSink(client, static_cast<ITfKeyEventSink*>(this), TRUE);
    if (FAILED(hr)) { manager.Reset(); client = TF_CLIENTID_NULL; return hr; }
    TF_PRESERVEDKEY toggle = { VK_SPACE, TF_MOD_CONTROL };
    keys->PreserveKey(client, KEY_Toggle, &toggle, L"聊商中英文切换", 8);
    ComPtr<ITfSource> source; if (SUCCEEDED(manager.As(&source))) source->AdviseSink(IID_ITfThreadMgrEventSink, static_cast<ITfThreadMgrEventSink*>(this), &threadCookie);
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Deactivate() override {
    Reset(false);
    if (manager) {
      ComPtr<ITfKeystrokeMgr> keys; if (SUCCEEDED(manager.As(&keys))) { TF_PRESERVEDKEY toggle = { VK_SPACE, TF_MOD_CONTROL }; keys->UnpreserveKey(KEY_Toggle, &toggle); keys->UnadviseKeyEventSink(client); }
      ComPtr<ITfSource> source; if (threadCookie != TF_INVALID_COOKIE && SUCCEEDED(manager.As(&source))) source->UnadviseSink(threadCookie);
    }
    threadCookie = TF_INVALID_COOKIE; client = TF_CLIENTID_NULL; manager.Reset(); Unwatch(); return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnSetFocus(BOOL foreground) override { if (!foreground) Reset(true); return S_OK; }
  HRESULT STDMETHODCALLTYPE OnTestKeyDown(ITfContext* ctx, WPARAM key, LPARAM, BOOL* eaten) override {
    if (!eaten) return E_POINTER; *eaten = FALSE;
    if (!Allowed(ctx) || (GetKeyState(VK_CONTROL) & 0x8000) || (GetKeyState(VK_MENU) & 0x8000) || (GetKeyState(VK_LWIN) & 0x8000) || (GetKeyState(VK_RWIN) & 0x8000)) return S_OK;
    if (key == VK_CAPITAL && !spelling.empty()) { *eaten = TRUE; return S_OK; }
    if (!chinese || (GetKeyState(VK_CAPITAL) & 1) || (GetKeyState(VK_SHIFT) & 0x8000)) return S_OK;
    if (key >= 'A' && key <= 'Z') *eaten = TRUE;
    else if (!spelling.empty() && (key == VK_OEM_7 || key == VK_BACK || key == VK_ESCAPE || key == VK_RETURN || key == VK_SPACE || key == VK_LEFT || key == VK_RIGHT || key == VK_PRIOR || key == VK_NEXT || (key >= '1' && key <= '5') || key == VK_OEM_COMMA || key == VK_OEM_PERIOD || key == VK_OEM_1)) *eaten = TRUE;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnKeyDown(ITfContext* ctx, WPARAM key, LPARAM value, BOOL* eaten) override {
    HRESULT hr = OnTestKeyDown(ctx, key, value, eaten); if (FAILED(hr) || !*eaten) return hr;
    try {
      if (context && context.Get() != ctx) Reset(false);
      if (key == VK_CAPITAL) { Apply(ctx, L"", spelling, true); *eaten = FALSE; }
      else if (key >= 'A' && key <= 'Z') { if (spelling.size() >= 39) return S_OK; std::wstring next = spelling + wchar_t(key - 'A' + 'a'); *eaten = SUCCEEDED(Apply(ctx, next, L"", false)); }
      else if (key == VK_OEM_7) { if (spelling.size() < 39 && !spelling.empty() && spelling.back() != L'\'') *eaten = SUCCEEDED(Apply(ctx, spelling + L"'", L"", false)); }
      else if (key == VK_BACK) { auto next = spelling.substr(0, spelling.size() - 1); *eaten = SUCCEEDED(Apply(ctx, next, L"", next.empty())); }
      else if (key == VK_ESCAPE) { *eaten = SUCCEEDED(Apply(ctx, L"", L"", true)); }
      else if (key == VK_RETURN) { *eaten = SUCCEEDED(Apply(ctx, L"", spelling, true)); }
      else if (key == VK_SPACE) Choose(highlight, false);
      else if (key >= '1' && key <= '5') Choose((highlight / 5) * 5 + key - '1', false);
      else if (key == VK_LEFT || key == VK_RIGHT || key == VK_PRIOR || key == VK_NEXT) {
        if (!candidates.empty()) { int change = key == VK_LEFT ? -1 : key == VK_RIGHT ? 1 : key == VK_PRIOR ? -5 : 5; highlight = static_cast<size_t>(std::clamp(static_cast<int>(highlight) + change, 0, static_cast<int>(candidates.size()) - 1)); Paint(); }
      }
      else if (key == VK_OEM_COMMA || key == VK_OEM_PERIOD || key == VK_OEM_1) {
        std::wstring text = candidates.empty() ? spelling : std::wstring(candidates[0].text.begin(), candidates[0].text.end());
        if (!candidates.empty() && candidates[0].consumed < static_cast<int>(spelling.size())) text += spelling.substr(candidates[0].consumed);
        // Punctuation confirms the whole sentence candidate, then inserts the punctuation. Never sends a message.
        text += key == VK_OEM_COMMA ? L"，" : key == VK_OEM_PERIOD ? L"。" : L"；";
        *eaten = SUCCEEDED(Apply(ctx, L"", text, true));
      }
    } catch (...) { *eaten = FALSE; Reset(true); }
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnTestKeyUp(ITfContext*, WPARAM, LPARAM, BOOL* eaten) override { if (!eaten) return E_POINTER; *eaten = FALSE; return S_OK; }
  HRESULT STDMETHODCALLTYPE OnKeyUp(ITfContext*, WPARAM, LPARAM, BOOL* eaten) override { if (!eaten) return E_POINTER; *eaten = FALSE; return S_OK; }
  HRESULT STDMETHODCALLTYPE OnPreservedKey(ITfContext*, REFGUID key, BOOL* eaten) override { if (!eaten) return E_POINTER; *eaten = key == KEY_Toggle; if (*eaten) { if (context && !spelling.empty()) { if (FAILED(Apply(context.Get(), L"", spelling, true))) { *eaten = FALSE; return S_OK; } } else Reset(true); chinese = !chinese; } return S_OK; }
  HRESULT STDMETHODCALLTYPE OnCompositionTerminated(TfEditCookie, ITfComposition* ended) override {
    if (composition.Get() == ended) { composition.Reset(); spelling.clear(); candidates.clear(); generation++; Hide(); Unwatch(); context.Reset(); } return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnInitDocumentMgr(ITfDocumentMgr*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE OnUninitDocumentMgr(ITfDocumentMgr*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE OnPushContext(ITfContext*) override { return S_OK; }
  HRESULT STDMETHODCALLTYPE OnPopContext(ITfContext* ctx) override { if (context.Get() == ctx) Reset(true); return S_OK; }
  HRESULT STDMETHODCALLTYPE OnSetFocus(ITfDocumentMgr* focus, ITfDocumentMgr*) override {
    if (context) { ComPtr<ITfDocumentMgr> owner; if (FAILED(context->GetDocumentMgr(&owner)) || owner.Get() != focus) Reset(true); } return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnEndEdit(ITfContext* ctx, TfEditCookie ec, ITfEditRecord* record) override {
    if (!composition || context.Get() != ctx) return S_OK;
    BOOL changed = FALSE; if (FAILED(record->GetSelectionStatus(&changed)) || !changed) return S_OK;
    TF_SELECTION selection; ULONG fetched; ComPtr<ITfRange> range;
    if (SUCCEEDED(ctx->GetSelection(ec, TF_DEFAULT_SELECTION, 1, &selection, &fetched)) && fetched) {
      if (SUCCEEDED(composition->GetRange(&range))) { LONG start = 0, end = 0; selection.range->CompareStart(ec, range.Get(), TF_ANCHOR_START, &start); selection.range->CompareEnd(ec, range.Get(), TF_ANCHOR_END, &end); if (start < 0 || end > 0) Reset(true); }
      selection.range->Release();
    }
    return S_OK;
  }
private:
  void Unwatch() { if (editSource && editCookie != TF_INVALID_COOKIE) editSource->UnadviseSink(editCookie); editCookie = TF_INVALID_COOKIE; editSource.Reset(); }
  bool Allowed(ITfContext* ctx) {
    if (!ctx || !manager || CompartmentBool(ctx, GUID_COMPARTMENT_KEYBOARD_DISABLED) || CompartmentBool(ctx, GUID_COMPARTMENT_EMPTYCONTEXT)) return false;
    TF_STATUS status{}; if (FAILED(ctx->GetStatus(&status)) || (status.dwDynamicFlags & TS_SD_READONLY)) return false;
    GUITHREADINFO gui{ sizeof(gui) }; if (GetGUIThreadInfo(0, &gui) && gui.hwndFocus && (GetWindowLongPtrW(gui.hwndFocus, GWL_STYLE) & ES_PASSWORD)) { wchar_t name[64]; GetClassNameW(gui.hwndFocus, name, 64); if (_wcsicmp(name, L"Edit") == 0) return false; }
    bool allowed = true;
    auto check = new Edit([&](TfEditCookie ec) {
      TF_SELECTION selection; ULONG fetched;
      if (FAILED(ctx->GetSelection(ec, TF_DEFAULT_SELECTION, 1, &selection, &fetched)) || !fetched) return S_OK;
      ComPtr<ITfReadOnlyProperty> property;
      if (SUCCEEDED(ctx->GetAppProperty(GUID_PROP_INPUTSCOPE, &property))) {
        VARIANT value; VariantInit(&value);
        if (SUCCEEDED(property->GetValue(ec, selection.range, &value)) && value.vt == VT_UNKNOWN && value.punkVal) {
          ComPtr<ITfInputScope> scope;
          if (SUCCEEDED(value.punkVal->QueryInterface(IID_PPV_ARGS(&scope)))) {
            InputScope* scopes = nullptr; UINT count = 0;
            if (SUCCEEDED(scope->GetInputScopes(&scopes, &count))) { for (UINT i = 0; i < count; i++) if (scopes[i] == IS_PASSWORD || scopes[i] == IS_EMAIL_SMTPEMAILADDRESS || scopes[i] == IS_URL || scopes[i] == IS_NUMBER || scopes[i] == IS_DIGITS) allowed = false; CoTaskMemFree(scopes); }
          }
        }
        VariantClear(&value);
      }
      selection.range->Release(); return S_OK;
    });
    HRESULT session = E_FAIL; HRESULT requested = ctx->RequestEditSession(client, check, TF_ES_SYNC | TF_ES_READ, &session); check->Release();
    // Only synchronous metadata is accessed; a failed read never captures an editor or any surrounding text.
    return SUCCEEDED(requested) && SUCCEEDED(session) && allowed;
  }
  HRESULT Apply(ITfContext* ctx, const std::wstring& next, const std::wstring& commit, bool finish, bool asynchronous = false) {
    if (!ctx) return E_INVALIDARG;
    ComPtr<ITfContext> captured = ctx; unsigned expected = generation;
    ComPtr<ITfTextInputProcessorEx> keepAlive(static_cast<ITfTextInputProcessorEx*>(this));
    auto edit = new Edit([this, keepAlive, captured, next, commit, finish, expected](TfEditCookie ec) {
      if (!manager || expected != generation) return S_OK;
      ComPtr<ITfDocumentMgr> focused, owner;
      if (FAILED(manager->GetFocus(&focused)) || FAILED(captured->GetDocumentMgr(&owner)) || focused.Get() != owner.Get()) return S_OK;
      return Write(ec, captured.Get(), next, commit, finish);
    });
    HRESULT session = E_FAIL; HRESULT requested = ctx->RequestEditSession(client, edit, (asynchronous ? TF_ES_ASYNCDONTCARE : TF_ES_SYNC) | TF_ES_READWRITE, &session);
    edit->Release(); return FAILED(requested) ? requested : session;
  }
  HRESULT Write(TfEditCookie ec, ITfContext* ctx, const std::wstring& next, const std::wstring& commit, bool finish) {
    ComPtr<ITfRange> range;
    if (composition) {
      HRESULT hr = composition->GetRange(&range); if (FAILED(hr)) return hr;
      const auto& text = finish ? commit : next;
      hr = range->SetText(ec, 0, text.c_str(), static_cast<LONG>(text.size())); if (FAILED(hr)) return hr;
      if (finish) { auto ending = composition; composition.Reset(); ending->EndComposition(ec); }
    }
    else if (!next.empty()) {
      ComPtr<ITfInsertAtSelection> insert; HRESULT hr = ctx->QueryInterface(IID_PPV_ARGS(&insert)); if (FAILED(hr)) return hr;
      hr = insert->InsertTextAtSelection(ec, TF_IAS_QUERYONLY, L"", 0, &range); if (FAILED(hr)) return hr;
      ComPtr<ITfContextComposition> managerComposition; hr = ctx->QueryInterface(IID_PPV_ARGS(&managerComposition)); if (FAILED(hr)) return hr;
      hr = managerComposition->StartComposition(ec, range.Get(), this, &composition); if (FAILED(hr)) return hr;
      hr = range->SetText(ec, 0, next.c_str(), static_cast<LONG>(next.size())); if (FAILED(hr)) return hr;
    }
    if (range) { ComPtr<ITfRange> caret; if (SUCCEEDED(range->Clone(&caret))) { caret->Collapse(ec, TF_ANCHOR_END); TF_SELECTION selection{ caret.Get(), { TF_AE_NONE, FALSE } }; ctx->SetSelection(ec, 1, &selection); } }
    spelling = finish ? L"" : next; highlight = 0;
    if (!spelling.empty()) {
      context = ctx; candidates = Decode(spelling);
      if (!editSource && SUCCEEDED(ctx->QueryInterface(IID_PPV_ARGS(&editSource)))) editSource->AdviseSink(IID_ITfTextEditSink, static_cast<ITfTextEditSink*>(this), &editCookie);
      ComPtr<ITfContextView> view;
      if (SUCCEEDED(ctx->GetActiveView(&view)) && range) { BOOL clipped; RECT rect; if (SUCCEEDED(view->GetTextExt(ec, range.Get(), &rect, &clipped))) anchor = rect; HWND owner; if (SUCCEEDED(view->GetWnd(&owner)) && owner) dpi = static_cast<int>(GetDpiForWindow(owner)); }
      Paint();
    } else { candidates.clear(); context.Reset(); Unwatch(); Hide(); }
    return S_OK;
  }
  void Reset(bool discard) {
    generation++; spelling.clear(); candidates.clear(); Hide();
    auto old = composition; auto oldContext = context; composition.Reset(); context.Reset(); Unwatch();
    if (!old || !oldContext || client == TF_CLIENTID_NULL) return;
    // Cancellation touches only the range owned by THIS composition, never surrounding editor text.
    auto edit = new Edit([old, discard](TfEditCookie ec) { ComPtr<ITfRange> range; if (discard && SUCCEEDED(old->GetRange(&range))) range->SetText(ec, 0, L"", 0); return old->EndComposition(ec); });
    HRESULT session; oldContext->RequestEditSession(client, edit, TF_ES_ASYNCDONTCARE | TF_ES_READWRITE, &session); edit->Release();
  }
  void Choose(size_t index, bool async) {
    if (!context || spelling.empty()) return;
    if (candidates.empty()) { Apply(context.Get(), L"", spelling, true, async); return; }
    if (index >= candidates.size()) return;
    const auto item = candidates[index]; auto target = context; auto suffix = spelling.substr(item.consumed);
    std::wstring committed(item.text.begin(), item.text.end());
    if (suffix.empty()) Apply(target.Get(), L"", committed, true, async);
    else {
      unsigned expected = generation; ComPtr<ITfTextInputProcessorEx> keepAlive(static_cast<ITfTextInputProcessorEx*>(this));
      auto edit = new Edit([this, keepAlive, target, suffix, committed, expected](TfEditCookie ec) { HRESULT hr = S_OK; if (expected == generation) { ComPtr<ITfDocumentMgr> focus, owner; if (FAILED(manager->GetFocus(&focus)) || FAILED(target->GetDocumentMgr(&owner)) || focus.Get() != owner.Get()) return S_OK; hr = Write(ec, target.Get(), L"", committed, true); if (SUCCEEDED(hr)) hr = Write(ec, target.Get(), suffix, L"", false); } return hr; });
      HRESULT result; target->RequestEditSession(client, edit, (async ? TF_ES_ASYNCDONTCARE : TF_ES_SYNC) | TF_ES_READWRITE, &result); edit->Release();
    }
  }
  void Hide() { if (window) ShowWindow(window, SW_HIDE); }
  static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM w, LPARAM l) {
    Service* self = reinterpret_cast<Service*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    if (msg == WM_NCCREATE) { self = static_cast<Service*>(reinterpret_cast<CREATESTRUCTW*>(l)->lpCreateParams); SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self)); }
    if (!self) return DefWindowProcW(hwnd, msg, w, l);
    if (msg == WM_MOUSEACTIVATE) return MA_NOACTIVATE;
    if (msg == WM_LBUTTONUP) { POINT point{ static_cast<short>(LOWORD(l)), static_cast<short>(HIWORD(l)) }; if (PtInRect(&self->aiRect, point)) { self->Reset(true); OpenAssistant(); } else for (size_t i = 0; i < self->hitRects.size(); i++) if (PtInRect(&self->hitRects[i], point)) { self->Choose((self->highlight / 5) * 5 + i, true); break; } return 0; }
    if (msg == WM_PAINT) { self->Draw(hwnd); return 0; }
    if (msg == WM_ERASEBKGND) return 1;
    return DefWindowProcW(hwnd, msg, w, l);
  }
  int Scale(int value) const { return MulDiv(value, dpi > 0 ? dpi : 96, 96); }
  void Paint() {
    if (spelling.empty()) { Hide(); return; }
    if (!window) {
      WNDCLASSW wc{}; wc.hInstance = g_instance; wc.lpfnWndProc = WindowProc; wc.lpszClassName = L"ChatQCandidateWindowV1"; wc.hCursor = LoadCursor(nullptr, IDC_ARROW); RegisterClassW(&wc);
      window = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST, wc.lpszClassName, L"聊商拼音候选", WS_POPUP | WS_BORDER, 0, 0, 600, 130, nullptr, nullptr, g_instance, this);
    }
    if (!window) return;
    int width = Scale(620), height = Scale(124); RECT work{}; HMONITOR monitor = MonitorFromRect(&anchor, MONITOR_DEFAULTTONEAREST); MONITORINFO info{ sizeof(info) }; GetMonitorInfoW(monitor, &info); work = info.rcWork;
    width = std::min(width, static_cast<int>(work.right - work.left)); int x = std::clamp(static_cast<int>(anchor.left), static_cast<int>(work.left), std::max(static_cast<int>(work.left), static_cast<int>(work.right) - width));
    int y = anchor.bottom + Scale(4); if (y + height > work.bottom) y = anchor.top - height - Scale(4); y = std::max(y, static_cast<int>(work.top));
    SetWindowPos(window, HWND_TOPMOST, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW); InvalidateRect(window, nullptr, TRUE);
  }
  void Draw(HWND hwnd) {
    PAINTSTRUCT paint; HDC dc = BeginPaint(hwnd, &paint); RECT clientRect; GetClientRect(hwnd, &clientRect); HBRUSH background = CreateSolidBrush(RGB(250, 249, 254)); FillRect(dc, &clientRect, background); DeleteObject(background);
    HFONT font = CreateFontW(-Scale(17), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Microsoft YaHei UI"); HGDIOBJ old = SelectObject(dc, font); SetBkMode(dc, TRANSPARENT); SetTextColor(dc, RGB(82, 60, 148));
    RECT pre{ Scale(14), Scale(6), clientRect.right - Scale(14), Scale(36) }; std::wstring header = spelling + L"    ·  聊商拼音"; DrawTextW(dc, header.c_str(), -1, &pre, DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
    hitRects.clear(); size_t first = (highlight / 5) * 5; int slot = (clientRect.right - Scale(20)) / 5;
    for (size_t i = first; i < std::min(first + 5, candidates.size()); i++) {
      RECT rect{ Scale(10) + static_cast<int>(i - first) * slot, Scale(38), Scale(10) + static_cast<int>(i - first + 1) * slot - Scale(4), Scale(80) }; hitRects.push_back(rect);
      if (i == highlight) { HBRUSH selected = CreateSolidBrush(RGB(231, 223, 248)); FillRect(dc, &rect, selected); DeleteObject(selected); }
      std::wstring text = std::to_wstring(i - first + 1) + L" " + std::wstring(candidates[i].text.begin(), candidates[i].text.end()); RECT padded = rect; padded.left += Scale(6); padded.right -= Scale(4); DrawTextW(dc, text.c_str(), -1, &padded, DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
    }
    SetTextColor(dc, RGB(102, 98, 115)); RECT hint{ Scale(14), Scale(86), clientRect.right - Scale(110), Scale(119) }; std::wstring label = candidates.empty() ? L"空格确认原文 · Esc 取消" : L"空格选词 · 1–5 选择 · PgUp/PgDn 翻页"; DrawTextW(dc, label.c_str(), -1, &hint, DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
    aiRect = { clientRect.right - Scale(106), Scale(82), clientRect.right - Scale(10), Scale(122) }; HBRUSH purple = CreateSolidBrush(RGB(112, 84, 200)); FillRect(dc, &aiRect, purple); DeleteObject(purple); SetTextColor(dc, RGB(255, 255, 255)); DrawTextW(dc, L"AI 回复", -1, &aiRect, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    SelectObject(dc, old); DeleteObject(font); EndPaint(hwnd, &paint);
  }
};
HRESULT CreateService(REFIID iid, void** output) { auto service = new Service(); HRESULT hr = service->QueryInterface(iid, output); service->Release(); return hr; }
