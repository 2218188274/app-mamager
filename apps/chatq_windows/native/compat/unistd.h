#pragma once
#include <io.h>
#include <stdio.h>
inline int ftruncate(int fd, long size) { return _chsize_s(fd, size) == 0 ? 0 : -1; }
