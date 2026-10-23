#include "chatq_decoder.h"
#include "jni/include/pinyinime.h"
#include <algorithm>
namespace chatq {
static bool ready = false;
bool open(const std::string& dictionary, const std::string& userDictionary) {
  close();
  ready = ime_pinyin::im_open_decoder(dictionary.c_str(), userDictionary.c_str());
  if (ready) ime_pinyin::im_set_max_lens(39, 16);
  return ready;
}
void close() { ime_pinyin::im_close_decoder(); ready = false; }
std::vector<Candidate> decode(const std::string& spelling) {
  std::vector<Candidate> result;
  if (!ready || spelling.empty() || spelling.size() > 39 ||
      !std::all_of(spelling.begin(), spelling.end(), [](char c) { return (c >= 'a' && c <= 'z') || c == '\''; })) return result;
  ime_pinyin::im_reset_search();
  const auto count = ime_pinyin::im_search(spelling.c_str(), spelling.size());
  size_t decoded = 0;
  ime_pinyin::im_get_sps_str(&decoded);
  const ime_pinyin::uint16* starts = nullptr;
  const auto syllables = ime_pinyin::im_get_spl_start_pos(starts);
  for (size_t i = 0; i < std::min(count, size_t(128)); ++i) {
    ime_pinyin::char16 buffer[64] = {};
    if (!ime_pinyin::im_get_candidate(i, buffer, 64)) continue;
    std::u16string text;
    for (size_t j = 0; j < 63 && buffer[j]; ++j) text.push_back(static_cast<char16_t>(buffer[j]));
    size_t consumed = i == 0 ? decoded : (text.size() <= syllables && starts ? starts[text.size()] : 0);
    // Separators immediately following a selected word belong to that word.
    while (consumed < spelling.size() && spelling[consumed] == '\'') ++consumed;
    if (text.empty() || consumed == 0 || consumed > spelling.size()) continue;
    if (std::none_of(result.begin(), result.end(), [&](const Candidate& c) { return c.text == text && c.consumed == int(consumed); }))
      result.push_back({text, int(consumed)});
  }
  return result;
}
}
