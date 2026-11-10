  struct AiHit {RECT bounds;int action;};
  bool aiOpen=false,aiBusy=false,aiWriting=false;int aiPage=0,aiScroll=0,aiPending=0,aiMaxScroll=0,aiFocus=0,aiHover=-1;HWND aiForeground=nullptr;
  bool aiKeyHeld[256]{};ComPtr<ITfContext> aiKeyContext;
  std::wstring aiSource,aiNotice,aiRevision;std::vector<std::wstring> aiReplies;std::vector<AiHit> aiHits;RECT aiBody{};
  ComPtr<ITfContext> aiContext;ComPtr<ITfRange> aiSelection;std::unique_ptr<chatq::AiJob> aiJob;
  bool AiBound(TfEditCookie ec) {
    if(!manager||!aiContext||!aiSelection||GetForegroundWindow()!=aiForeground)return false;
    ComPtr<ITfDocumentMgr> focus,owner;if(FAILED(manager->GetFocus(&focus))||FAILED(aiContext->GetDocumentMgr(&owner))||focus.Get()!=owner.Get())return false;
    TF_SELECTION selection{};ULONG fetched=0;if(FAILED(aiContext->GetSelection(ec,TF_DEFAULT_SELECTION,1,&selection,&fetched))||!fetched)return false;
    LONG a=1,b=1;HRESULT start=selection.range->CompareStart(ec,aiSelection.Get(),TF_ANCHOR_START,&a),end=selection.range->CompareEnd(ec,aiSelection.Get(),TF_ANCHOR_END,&b);selection.range->Release();return SUCCEEDED(start)&&SUCCEEDED(end)&&!a&&!b;
  }
  bool AiCurrent() {
    if(!aiOpen||!aiContext||!Allowed(aiContext.Get()))return false;
    bool valid=false;auto edit=new Edit([&](TfEditCookie ec){valid=AiBound(ec);return S_OK;});HRESULT session=E_FAIL;HRESULT hr=aiContext->RequestEditSession(client,edit,TF_ES_SYNC|TF_ES_READ,&session);edit->Release();return SUCCEEDED(hr)&&SUCCEEDED(session)&&valid;
  }
  void CloseAi() {
    aiOpen=false;aiBusy=false;aiPending=0;aiHover=-1;aiJob.reset();aiContext.Reset();aiSelection.Reset();aiReplies.clear();aiSource.clear();aiRevision.clear();aiHits.clear();
    if(window)KillTimer(window,73);
    if(!composition)Unwatch();
  }
  void OpenAi() {
    ComPtr<ITfContext> target=context;
    if(!target&&manager){ComPtr<ITfDocumentMgr> focus;if(SUCCEEDED(manager->GetFocus(&focus))&&focus)focus->GetTop(&target);}
    if(!target||!Allowed(target.Get()))return;
    CloseAi();aiContext=target;aiForeground=GetForegroundWindow();aiOpen=true;aiPage=aiScroll=aiFocus=0;aiNotice=L"Tab选择操作，Enter确认；Esc返回打字。";
    auto edit=new Edit([&](TfEditCookie ec){TF_SELECTION selected{};ULONG fetched=0;HRESULT hr=target->GetSelection(ec,TF_DEFAULT_SELECTION,1,&selected,&fetched);if(FAILED(hr)||!fetched)return E_FAIL;hr=selected.range->Clone(&aiSelection);selected.range->Release();
      ComPtr<ITfContextView> view;if(SUCCEEDED(target->GetActiveView(&view))&&aiSelection){BOOL clipped;RECT caret;if(SUCCEEDED(view->GetTextExt(ec,aiSelection.Get(),&caret,&clipped)))anchor=caret;HWND host;if(SUCCEEDED(view->GetWnd(&host))&&host)dpi=GetDpiForWindow(host);}return hr;});
    HRESULT session=E_FAIL;HRESULT hr=target->RequestEditSession(client,edit,TF_ES_SYNC|TF_ES_READ,&session);edit->Release();
    if(FAILED(hr)||FAILED(session)||!aiSelection){CloseAi();return;}
    if(!editSource&&SUCCEEDED(target->QueryInterface(IID_PPV_ARGS(&editSource))))editSource->AdviseSink(IID_ITfTextEditSink,static_cast<ITfTextEditSink*>(this),&editCookie);
    Paint();if(window)SetTimer(window,73,80,nullptr);
  }
  std::wstring SelectedAiText() {
    std::wstring value;bool valid=false;
    auto edit=new Edit([&](TfEditCookie ec){if(!AiBound(ec))return E_FAIL;wchar_t text[1002]{};ULONG count=0;HRESULT hr=aiSelection->GetText(ec,0,text,1001,&count);if(SUCCEEDED(hr)&&count>0&&count<=1000){value.assign(text,count);valid=true;}return hr;});HRESULT session=E_FAIL;aiContext->RequestEditSession(client,edit,TF_ES_SYNC|TF_ES_READ,&session);edit->Release();return valid?value:L"";
  }
  void StartAi(unsigned mode,const std::wstring& text) {
    if(!AiCurrent()){CloseAi();Hide();return;}
    aiJob.reset();aiReplies.clear();aiRevision.clear();aiPage=aiScroll=0;aiPending=0;aiBusy=false;
    if(text.empty()||text.size()>1000){aiNotice=L"请复制或选中1–1000字，内容过长时先缩短。";Paint();return;}
    aiSource=text;aiNotice=mode==1?L"正在润色 · 可点停止":L"正在生成 · 可点停止";
    try{aiJob=std::make_unique<chatq::AiJob>(chatq::AssistantExecutable(),mode,text);aiBusy=true;}catch(...){aiNotice=L"无法启动，请重新安装完整版聊商。";}
    Paint();
  }
  void PollAi() {
    if(!aiOpen)return;if(!AiCurrent()){CloseAi();Hide();return;}
    if(!aiJob||!aiJob->Ready())return;
    auto result=aiJob->Take();aiJob.reset();aiBusy=false;
    if(result.status){aiReplies.clear();aiPending=0;aiNotice=result.caption;Paint();return;}
    if(aiPending){int action=aiPending;aiPending=0;if(result.revision!=aiRevision){aiReplies.clear();aiNotice=L"配置已变化，请重新生成。";Paint();return;}UseAi(action);return;}
    aiRevision=result.revision;aiReplies=std::move(result.replies);aiNotice=result.caption;if(aiReplies.empty())aiNotice=L"没有可用回复，请手动重试。";Paint();
  }
  static bool CopyAiText(HWND owner,const std::wstring& text) {
    if(!OpenClipboard(owner))return false;
    HANDLE data=GlobalAlloc(GMEM_MOVEABLE,(text.size()+1)*sizeof(wchar_t));bool ok=false;
    if(data){void* bytes=GlobalLock(data);if(bytes){memcpy(bytes,text.c_str(),(text.size()+1)*sizeof(wchar_t));GlobalUnlock(data);if(EmptyClipboard()&&SetClipboardData(CF_UNICODETEXT,data)){ok=true;data=nullptr;}}if(data)GlobalFree(data);}CloseClipboard();return ok;
  }
  void UseAi(int action) {
    if(!AiCurrent()||aiPage<0||static_cast<size_t>(aiPage)>=aiReplies.size()){CloseAi();Hide();return;}
    const auto value=aiReplies[aiPage];
    if(action==6){aiNotice=CopyAiText(window,value)?L"已复制，可回输入框粘贴。":L"复制未完成，请再点一次。";Paint();return;}
    // Recheck inside the actual edit lock. Never inject Enter or replace another editor.
    auto target=aiContext;aiWriting=true;auto edit=new Edit([&](TfEditCookie ec){if(!AiBound(ec))return E_FAIL;
      // Opening AI must not erase unfinished typing. Settle only our own
      // composition before appending the explicitly selected reply.
      if(composition&&!spelling.empty()){std::wstring pending;auto rest=spelling;while(!rest.empty()){auto list=Decode(rest);if(list.empty()||list[0].consumed<=0||list[0].consumed>static_cast<int>(rest.size())){pending+=rest;break;}pending.append(list[0].text.begin(),list[0].text.end());rest=rest.substr(list[0].consumed);}HRESULT hr=Write(ec,target.Get(),L"",pending,true);if(FAILED(hr))return hr;}
      return Write(ec,target.Get(),L"",value,true);});HRESULT session=E_FAIL;HRESULT hr=target->RequestEditSession(client,edit,TF_ES_SYNC|TF_ES_READWRITE,&session);edit->Release();aiWriting=false;
    if(SUCCEEDED(hr)&&SUCCEEDED(session)){CloseAi();Hide();}else{aiNotice=L"当前输入框暂不支持填入，可以复制后手动粘贴。";Paint();}
  }
  void AiAction(int action) {
    if(action==0){CloseAi();if(!spelling.empty())Paint();else Hide();return;}
    if(!AiCurrent()){CloseAi();Hide();return;}
    if(action==9){CloseAi();Hide();OpenAssistant();return;}
    if(action==3){aiJob.reset();aiBusy=false;aiPending=0;aiNotice=L"已停止，可手动重试。";Paint();return;}
    if(aiBusy)return;
    if(action==1){std::wstring text;if(OpenClipboard(window)){HANDLE data=GetClipboardData(CF_UNICODETEXT);if(data){const auto size=GlobalSize(data);const auto* p=static_cast<const wchar_t*>(GlobalLock(data));if(p){size_t length=0;while(length<std::min<size_t>(size/sizeof(wchar_t),1001)&&p[length])++length;if(length&&length<=1000&&length<size/sizeof(wchar_t))text.assign(p,length);GlobalUnlock(data);}}CloseClipboard();}StartAi(0,text);}
    else if(action==2)StartAi(1,SelectedAiText());
    else if(action==7||action==8){aiPage=std::clamp(aiPage+(action==7?-1:1),0,std::max(0,static_cast<int>(aiReplies.size())-1));aiScroll=0;Paint();}
    else if((action==5||action==6)&&!aiReplies.empty()){aiNotice=L"正在核对当前配置…";aiPending=action;aiBusy=true;try{aiJob=std::make_unique<chatq::AiJob>(chatq::AssistantExecutable(),2,aiRevision);}catch(...){aiBusy=false;aiPending=0;aiNotice=L"无法核对配置，请手动重试。";}Paint();}
  }
  int AiTextScale() const {
    DWORD textScale=100,bytes=sizeof(textScale);if(RegGetValueW(HKEY_CURRENT_USER,L"Software\\Microsoft\\Accessibility",L"TextScaleFactor",RRF_RT_REG_DWORD,nullptr,&textScale,&bytes)!=ERROR_SUCCESS)textScale=100;
    return static_cast<int>(std::clamp<DWORD>(textScale,100,200));
  }
  void ResetAiKeys(){for(auto& key:aiKeyHeld)key=false;aiKeyContext.Reset();}
  bool HeldAiKey(ITfContext* ctx,WPARAM key) const{return key<256&&aiKeyContext.Get()==ctx&&aiKeyHeld[key];}
  void ReleaseAiKey(WPARAM key){if(key<256)aiKeyHeld[key]=false;for(bool held:aiKeyHeld)if(held)return;aiKeyContext.Reset();}
  bool AiKey(WPARAM key) const {
    if((GetKeyState(VK_CONTROL)|GetKeyState(VK_MENU)|GetKeyState(VK_LWIN)|GetKeyState(VK_RWIN))&0x8000)return false;
    if(key==VK_TAB)return true;
    if(GetKeyState(VK_SHIFT)&0x8000)return false;
    return key==VK_ESCAPE||key==VK_RETURN||key==VK_SPACE||key==VK_LEFT||key==VK_RIGHT||key==VK_UP||key==VK_DOWN||key==VK_PRIOR||key==VK_NEXT||key==VK_HOME||key==VK_END;
  }
  std::vector<int> AiActions() const {
    std::vector<int> actions{0};if(aiBusy){actions.push_back(3);return actions;}
    actions.push_back(1);actions.push_back(2);
    if(aiPage>0)actions.push_back(7);if(aiPage+1<static_cast<int>(aiReplies.size()))actions.push_back(8);
    actions.push_back(9);if(!aiReplies.empty()){actions.push_back(6);actions.push_back(5);}return actions;
  }
  void NormalizeAiFocus(){auto actions=AiActions();if(std::find(actions.begin(),actions.end(),aiFocus)==actions.end())aiFocus=aiBusy?3:0;}
  void AiKeyboard(WPARAM key) {
    if(!AiCurrent()){CloseAi();Hide();return;}NormalizeAiFocus();aiHover=-1;
    if(key==VK_ESCAPE){AiAction(0);return;}
    if(key==VK_TAB){auto actions=AiActions();int at=static_cast<int>(std::find(actions.begin(),actions.end(),aiFocus)-actions.begin());int size=static_cast<int>(actions.size());aiFocus=actions[(at+size+((GetKeyState(VK_SHIFT)&0x8000)?-1:1))%size];}
    else if(key==VK_RETURN||key==VK_SPACE){AiAction(aiFocus);return;}
    else if(key==VK_LEFT||key==VK_RIGHT){if(!aiBusy&&!aiReplies.empty())AiAction(key==VK_LEFT?7:8);return;}
    else {
      int step=Scale(48);if(key==VK_PRIOR||key==VK_NEXT)step=std::max(Scale(48),static_cast<int>(aiBody.bottom-aiBody.top)-Scale(24));
      if(key==VK_HOME)aiScroll=0;else if(key==VK_END)aiScroll=aiMaxScroll;
      else aiScroll=std::clamp(aiScroll+((key==VK_UP||key==VK_PRIOR)?-step:step),0,aiMaxScroll);
    }
    if(window)InvalidateRect(window,nullptr,TRUE);
  }
  void DrawAi(HDC dc,const RECT& bounds) {
    aiHits.clear();NormalizeAiFocus();int w=bounds.right,h=bounds.bottom;SetBkMode(dc,TRANSPARENT);
    int fontSize=MulDiv(16,AiTextScale(),100);bool large=fontSize>20,compact=large&&h<Scale(500),shortPanel=h<Scale(400);
    HFONT font=CreateFontW(-Scale(fontSize),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");auto old=SelectObject(dc,font);
    auto label=[&](const std::wstring& text,RECT rect,COLORREF color,UINT flags=DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS){SetTextColor(dc,color);DrawTextW(dc,text.c_str(),-1,&rect,flags|DT_NOPREFIX);};
    auto button=[&](const wchar_t* text,RECT rect,int action,bool primary=false,bool enabled=true){bool strong=primary&&enabled,hover=enabled&&action==aiHover;COLORREF fill=strong?(hover?chatq::ui::AccentHover:chatq::ui::Accent):(hover?chatq::ui::Hover:chatq::ui::Raised);chatq::ui::SurfaceRect(dc,rect,fill,strong?fill:chatq::ui::Line,Scale(8));label(text,rect,enabled?(strong?chatq::ui::Surface:chatq::ui::Ink):chatq::ui::Muted,DT_SINGLELINE|DT_VCENTER|DT_CENTER);if(enabled){aiHits.push_back({rect,action});if(action==aiFocus){RECT focus=rect;InflateRect(&focus,-Scale(4),-Scale(4));DrawFocusRect(dc,&focus);}}};
    label(L"聊商 · 快捷回复",{Scale(16),Scale(4),w-Scale(100),Scale(48)},chatq::ui::Ink);button(L"返回",{w-Scale(96),Scale(4),w-Scale(8),Scale(48)},0);
    int half=(w-Scale(40))/2;button(L"粘贴生成",{Scale(16),Scale(56),Scale(16)+half,Scale(100)},1,aiReplies.empty(),!aiBusy);button(L"选中润色",{Scale(24)+half,Scale(56),w-Scale(16),Scale(100)},2,false,!aiBusy);
    if(!shortPanel)label(aiSource.empty()?L"来源：主动粘贴，或输入框内选中的文字":L"来源："+aiSource,{Scale(16),Scale(104),w-Scale(16),Scale(large?152:132)},chatq::ui::Secondary);
    int noticeTop=shortPanel?104:large?156:136,noticeBottom=noticeTop+(large&&!compact?88:large?44:28);
    label(aiNotice,{Scale(16),Scale(noticeTop),w-Scale(16),Scale(noticeBottom)},chatq::ui::Secondary,large&&!compact?DT_WORDBREAK|DT_END_ELLIPSIS:DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS);
    aiBody={Scale(16),Scale(noticeBottom+8),w-Scale(16),h-Scale(108)};
    if(aiBody.bottom>aiBody.top){chatq::ui::SurfaceRect(dc,aiBody,chatq::ui::Surface,chatq::ui::Line,Scale(12));InflateRect(&aiBody,-Scale(shortPanel?8:12),-Scale(shortPanel?8:12));}
    if(aiBody.bottom>aiBody.top){std::wstring value=aiReplies.empty()?L"回复会显示在这里。生成使用你保存的API和人设，消耗供应商额度。":aiReplies[aiPage];RECT measured=aiBody;DrawTextW(dc,value.c_str(),-1,&measured,DT_WORDBREAK|DT_NOPREFIX|DT_CALCRECT);aiMaxScroll=std::max<LONG>(0,measured.bottom-aiBody.bottom);aiScroll=std::clamp(aiScroll,0,aiMaxScroll);int saved=SaveDC(dc);IntersectClipRect(dc,aiBody.left,aiBody.top,aiBody.right,aiBody.bottom);RECT text=aiBody;text.top-=aiScroll;text.bottom=measured.bottom-aiScroll;label(value,text,chatq::ui::Ink,DT_WORDBREAK|DT_NOPREFIX);RestoreDC(dc,saved);}
    int bottom=h-Scale(100);label(aiReplies.empty()?L"Tab选操作":std::to_wstring(aiPage+1)+L" / "+std::to_wstring(aiReplies.size())+(shortPanel?L"":L" · ↑↓阅读"),{Scale(16),bottom,w-Scale(200),bottom+Scale(44)},chatq::ui::Secondary);
    button(L"上条",{w-Scale(184),bottom,w-Scale(100),bottom+Scale(44)},7,false,!aiBusy&&aiPage>0);button(L"下条",{w-Scale(92),bottom,w-Scale(8),bottom+Scale(44)},8,false,!aiBusy&&aiPage+1<static_cast<int>(aiReplies.size()));
    bottom=h-Scale(52);if(aiBusy)button(L"停止",{Scale(16),bottom,Scale(110),bottom+Scale(44)},3,true);
    else button(L"设置",{Scale(16),bottom,Scale(110),bottom+Scale(44)},9);
    button(L"复制",{w-Scale(208),bottom,w-Scale(116),bottom+Scale(44)},6,false,!aiBusy&&!aiReplies.empty());button(L"填入",{w-Scale(108),bottom,w-Scale(16),bottom+Scale(44)},5,true,!aiBusy&&!aiReplies.empty());
    SelectObject(dc,old);DeleteObject(font);
  }
