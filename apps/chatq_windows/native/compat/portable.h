#pragma once
#include <stdio.h>
#include <io.h>
#include <fcntl.h>
FILE* chatq_fopen(const char*, const char*);
int chatq_open(const char*, int, ...);
int chatq_unlink(const char*);
#define fopen chatq_fopen
#define open chatq_open
#define unlink chatq_unlink
