#pragma once
#include <mutex>
typedef std::mutex pthread_mutex_t;
#define PTHREAD_MUTEX_INITIALIZER {}
inline int pthread_mutex_lock(pthread_mutex_t* value) { value->lock(); return 0; }
inline int pthread_mutex_unlock(pthread_mutex_t* value) { value->unlock(); return 0; }
