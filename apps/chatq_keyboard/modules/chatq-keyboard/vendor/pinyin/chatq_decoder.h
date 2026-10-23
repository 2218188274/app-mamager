#pragma once
#include <string>
#include <vector>
namespace chatq {
struct Candidate { std::u16string text; int consumed; };
// All calls belong to the keyboard UI thread. No text is sent over the network.
bool open(const std::string& dictionary, const std::string& userDictionary);
void close();
std::vector<Candidate> decode(const std::string& spelling);
}
