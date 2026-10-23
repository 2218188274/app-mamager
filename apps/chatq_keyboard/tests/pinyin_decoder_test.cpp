#include "chatq_decoder.h"
#include <cassert>
#include <iostream>
#include <random>
#include <chrono>
static void includes(const std::string& spelling, const std::u16string& expected) {
  const auto items = chatq::decode(spelling);
  bool found = false;
  for (const auto& item : items) {
    assert(item.consumed > 0 && size_t(item.consumed) <= spelling.size());
    if (item.text == expected && size_t(item.consumed) == spelling.size()) found = true;
  }
  if (!found) { std::cerr << "Missing candidate for " << spelling << " (" << items.size() << ")\n"; std::abort(); }
}
int main(int argc, char** argv) {
  assert(argc == 3);
  assert(!chatq::open("/missing-dictionary.dat", argv[2]));
  assert(chatq::decode("nihao").empty());
  assert(chatq::open(argv[1], argv[2]));
  includes("nihao", u"你好"); includes("zhongguo", u"中国");
  includes("xiexie", u"谢谢"); includes("zaijian", u"再见");
  includes("woaini", u"我爱你"); includes("xi'an", u"西安");
  includes("lv", u"绿"); includes("nvpengyou", u"女朋友");
  assert(!chatq::decode("nh").empty());
  // Selecting a word prefix must retain the remainder of the composition.
  auto sentence = chatq::decode("nihaozhongguo"); bool prefix = false;
  for (const auto& c : sentence) if (c.text == u"你好" && c.consumed == 5) prefix = true;
  assert(prefix); includes("zhongguo", u"中国");
  includes("nihao", u"你好"); assert(!chatq::decode("niha").empty());
  assert(chatq::decode("").empty()); assert(chatq::decode("hello@example.com").empty());
  assert(chatq::decode(std::string(40, 'a')).empty());
  auto start = std::chrono::steady_clock::now();
  std::mt19937 rng(73); const std::string letters = "abcdefghijklmnopqrstuvwxyz'";
  for (int i = 0; i < 1000; ++i) {
    std::string raw;
    for (int j = 0, n = 1 + rng() % 39; j < n; ++j) raw += letters[rng() % letters.size()];
    for (auto& item : chatq::decode(raw)) assert(!item.text.empty() && item.consumed > 0 && size_t(item.consumed) <= raw.size());
  }
  includes("nihao", u"你好"); chatq::close(); assert(chatq::decode("nihao").empty());
  std::cout << "PASS offline Pinyin words, sentences, initials, v, apostrophe, prefix selection, backspace, invalid input, 1000 random compositions; "
    << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count() << "ms fuzz\n";
}
