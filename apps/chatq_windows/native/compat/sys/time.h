#pragma once
#include <chrono>
#ifndef _TIMEVAL_DEFINED
#define _TIMEVAL_DEFINED
struct timeval { long tv_sec; long tv_usec; };
#endif
inline int gettimeofday(timeval* value, void*) {
  const auto us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
  value->tv_sec = static_cast<long>(us / 1000000); value->tv_usec = static_cast<long>(us % 1000000); return 0;
}
