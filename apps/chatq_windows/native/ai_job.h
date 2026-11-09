#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <thread>
#include <mutex>
#include <atomic>
#include <memory>
namespace chatq {
struct AiResult { unsigned status=2; std::wstring revision, caption=L"无法生成，请检查API后手动重试。"; std::vector<std::wstring> replies; };
class AiJob {
  HANDLE cancel=nullptr; std::thread thread; std::mutex gate; AiResult result; std::atomic<bool> done{false};
public:
  AiJob(const std::wstring& executable,unsigned mode,const std::wstring& prompt);
  ~AiJob();
  void Cancel();
  bool Ready() const { return done.load(); }
  AiResult Take() { std::lock_guard<std::mutex> lock(gate);return result; }
};
std::wstring AssistantExecutable();
}
