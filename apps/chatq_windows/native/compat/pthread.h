#pragma once
#include <mutex>
#include <cerrno>
typedef std::mutex pthread_mutex_t;
#define PTHREAD_MUTEX_INITIALIZER {}
inline int pthread_mutex_lock(pthread_mutex_t* value) { value->lock(); return 0; }
inline int pthread_mutex_unlock(pthread_mutex_t* value) { value->unlock(); return 0; }
inline int pthread_mutex_trylock(pthread_mutex_t* value) { return value->try_lock() ? 0 : EBUSY; }
