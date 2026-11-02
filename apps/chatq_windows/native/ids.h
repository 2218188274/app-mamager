#pragma once
#include <windows.h>
#include <msctf.h>
#include <ctfutb.h>
#include <ctffunc.h>
// Stable production identities; test harness uses TF_RP_LOCALPROCESS, not a user-wide activation.
inline const CLSID CLSID_ChatQ = {0x748ad105,0x8033,0x4dc2,{0x9b,0x19,0x5e,0x0a,0x0a,0xc0,0x11,0xa1}};
inline const GUID PROFILE_ChatQ = {0xa8507ae6,0x64e4,0x4a6b,{0xa4,0x5d,0x0f,0xd6,0xf0,0xa5,0x53,0x10}};
inline const GUID KEY_Toggle = {0xc3221a83,0x6bd9,0x48ce,{0xb6,0x22,0x8c,0x9d,0xe5,0xc2,0x60,0xa6}};
inline constexpr LANGID ChatQLanguage = 0x0804;
inline constexpr wchar_t ChatQName[] = L"聊商拼音";
extern HINSTANCE g_instance;
extern LONG g_objects;
HRESULT CreateService(REFIID iid, void** output);
