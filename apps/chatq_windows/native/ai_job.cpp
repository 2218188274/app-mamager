#include "ai_job.h"
#include "ids.h"
#include <stdexcept>
#include <algorithm>
namespace chatq {
struct Handle { HANDLE value=nullptr; ~Handle(){if(value&&value!=INVALID_HANDLE_VALUE)CloseHandle(value);} };
std::wstring AssistantExecutable() {
 wchar_t path[32768]{};DWORD size=sizeof(path);
 if(RegGetValueW(HKEY_LOCAL_MACHINE,L"Software\\ChatQWindows",L"AssistantPath",RRF_RT_REG_SZ|RRF_SUBKEY_WOW6464KEY,nullptr,path,&size)!=ERROR_SUCCESS)return {};
 std::wstring result(path);if(result.size()<5||result.substr(result.size()-4)!=L".exe"||result.find(L'"')!=std::wstring::npos||GetFileAttributesW(result.c_str())==INVALID_FILE_ATTRIBUTES)return {};return result;
}
static void Number(std::vector<BYTE>& bytes,unsigned value){for(int i=0;i<4;i++)bytes.push_back(static_cast<BYTE>(value>>(i*8)));}
static AiResult Parse(const std::vector<BYTE>& bytes) {
 size_t pos=0;auto number=[&](){if(pos+4>bytes.size())throw std::runtime_error("protocol");unsigned n=0;for(int i=0;i<4;i++)n|=static_cast<unsigned>(bytes[pos++])<<(i*8);return n;};
 auto text=[&](size_t limit){auto length=number();if(length>limit||pos+length*2>bytes.size())throw std::runtime_error("protocol");std::wstring value;for(unsigned i=0;i<length;i++){value.push_back(static_cast<wchar_t>(bytes[pos]|(bytes[pos+1]<<8)));pos+=2;}return value;};
 if(number()!=0x31495143)throw std::runtime_error("protocol");AiResult r;r.status=number();auto count=number();if(r.status>4||count>10||(r.status&&count))throw std::runtime_error("protocol");
 r.revision=text(64);r.caption=text(160);for(unsigned i=0;i<count;i++){auto value=text(1000);if(value.empty())throw std::runtime_error("protocol");r.replies.push_back(value);}if(pos!=bytes.size())throw std::runtime_error("protocol");return r;
}
AiJob::AiJob(const std::wstring& exe,unsigned mode,const std::wstring& prompt) {
 cancel=CreateEventW(nullptr,TRUE,FALSE,nullptr);if(!cancel)throw std::runtime_error("event");
 InterlockedIncrement(&g_objects);
 try{thread=std::thread([this,exe,mode,prompt](){AiResult reply;
  try{
   if(exe.empty()||mode>2||prompt.empty()||prompt.size()>1000)throw std::runtime_error("request");
   SECURITY_ATTRIBUTES sa{sizeof(sa),nullptr,TRUE};Handle childIn,parentIn,childOut,parentOut,process,processThread;
   if(!CreatePipe(&childIn.value,&parentIn.value,&sa,8192)||!CreatePipe(&parentOut.value,&childOut.value,&sa,32768))throw std::runtime_error("pipe");
   SetHandleInformation(parentIn.value,HANDLE_FLAG_INHERIT,0);SetHandleInformation(parentOut.value,HANDLE_FLAG_INHERIT,0);
   SIZE_T size=0;InitializeProcThreadAttributeList(nullptr,1,0,&size);std::vector<BYTE> attributes(size);auto list=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
   if(!InitializeProcThreadAttributeList(list,1,0,&size))throw std::runtime_error("attributes");
   struct Attributes {LPPROC_THREAD_ATTRIBUTE_LIST p;~Attributes(){DeleteProcThreadAttributeList(p);}} cleanup{list};
   HANDLE handles[]={childIn.value,childOut.value};if(!UpdateProcThreadAttribute(list,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,handles,sizeof(handles),nullptr,nullptr))throw std::runtime_error("handles");
   STARTUPINFOEXW start{};start.StartupInfo.cb=sizeof(start);start.StartupInfo.dwFlags=STARTF_USESTDHANDLES|STARTF_USESHOWWINDOW;start.StartupInfo.wShowWindow=SW_HIDE;start.StartupInfo.hStdInput=childIn.value;start.StartupInfo.hStdOutput=childOut.value;start.StartupInfo.hStdError=childOut.value;start.lpAttributeList=list;
   PROCESS_INFORMATION pi{};std::wstring command=L"\""+exe+L"\" --ime-worker";
   if(!CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,TRUE,CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,nullptr,nullptr,&start.StartupInfo,&pi))throw std::runtime_error("process");
   process.value=pi.hProcess;processThread.value=pi.hThread;CloseHandle(childIn.value);childIn.value=nullptr;CloseHandle(childOut.value);childOut.value=nullptr;
   struct StopChild{HANDLE p;~StopChild(){if(WaitForSingleObject(p,0)==WAIT_TIMEOUT){TerminateProcess(p,1);WaitForSingleObject(p,2000);}}} stop{process.value};
   std::vector<BYTE> request;Number(request,0x31495143);Number(request,mode);Number(request,static_cast<unsigned>(prompt.size()));for(wchar_t c:prompt){request.push_back(c&255);request.push_back(c>>8);}DWORD written=0;
   if(!WriteFile(parentIn.value,request.data(),static_cast<DWORD>(request.size()),&written,nullptr)||written!=request.size())throw std::runtime_error("write");SecureZeroMemory(request.data(),request.size());CloseHandle(parentIn.value);parentIn.value=nullptr;
   std::vector<BYTE> response;ULONGLONG started=GetTickCount64();
   for(;;){
    if(WaitForSingleObject(cancel,0)==WAIT_OBJECT_0||GetTickCount64()-started>95000)throw std::runtime_error("cancel");
    DWORD available=0;if(!PeekNamedPipe(parentOut.value,nullptr,0,nullptr,&available,nullptr)){if(GetLastError()==ERROR_BROKEN_PIPE)break;throw std::runtime_error("peek");}
    if(available){BYTE block[4096];DWORD read=0;if(!ReadFile(parentOut.value,block,std::min<DWORD>(available,sizeof(block)),&read,nullptr)||!read)throw std::runtime_error("read");if(response.size()+read>22000)throw std::runtime_error("bound");response.insert(response.end(),block,block+read);}
    else if(WaitForSingleObject(process.value,0)==WAIT_OBJECT_0)break;
    else WaitForSingleObject(cancel,20);
   }
   reply=Parse(response);SecureZeroMemory(response.data(),response.size());
  }catch(...){/* Fixed local message only; never emit provider output or credentials. */}
  {std::lock_guard<std::mutex> lock(gate);result=std::move(reply);}done=true;InterlockedDecrement(&g_objects);
 });}catch(...){InterlockedDecrement(&g_objects);CloseHandle(cancel);cancel=nullptr;throw;}
}
void AiJob::Cancel(){if(cancel)SetEvent(cancel);}
AiJob::~AiJob(){Cancel();if(thread.joinable())thread.join();if(cancel)CloseHandle(cancel);}
}
