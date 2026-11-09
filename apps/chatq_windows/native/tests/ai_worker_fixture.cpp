// Anonymous-pipe fixture for disposable VM input service checks, never packaged.
#include <windows.h>
#include <string>
#include <vector>
#include <cstdio>
#include <io.h>
#include <fcntl.h>
static unsigned Number(){unsigned n=0;if(fread(&n,4,1,stdin)!=1)ExitProcess(2);return n;}
static void Number(unsigned n){fwrite(&n,4,1,stdout);}
static void Text(const std::wstring& s){Number(static_cast<unsigned>(s.size()));fwrite(s.data(),2,s.size(),stdout);}
int main(){_setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);if(Number()!=0x31495143)return 2;unsigned mode=Number(),length=Number();if(mode>2||length>1000)return 2;std::wstring text(length,L' ');if(fread(text.data(),2,length,stdin)!=length)return 2;if(text==L"fixture-slow")Sleep(5000);Number(0x31495143);Number(0);Number(mode==2?0:3);Text(L"0123456789abcdef0123456789abcdef");Text(L"合成人设 · 3条");if(mode!=2){Text(L"合成回复一");Text(L"合成回复二");Text(std::wstring(200,L'长')+L"回复尾部");}fflush(stdout);return 0;}
