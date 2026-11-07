#include "chatq_decoder.h"
#include "chatq_phrases.h"
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
  // Chat phrases must be available in the shared Windows/Android decoder.
  assert(chatq::decode("wzdl").front().text == u"我知道了");
  assert(chatq::decode("jtykm").front().text == u"今天有空吗");
  assert(chatq::decode("jintianyoukongma").front().text == u"今天有空吗");
  includes("womenmingtianjian", u"我们明天见");
  includes("wo'xian'zai'you'kong", u"我现在有空");
  for (const auto& fixture : std::vector<std::pair<std::string, std::u16string>>{
      {"haodemeiwenti", u"好的没问题"}, {"shoudaoxiexie", u"收到谢谢"},
      {"bangwokanyixia", u"帮我看一下"}}) {
    auto items = chatq::decode(fixture.first);
    assert(!items.empty() && items.front().text == fixture.second && items.front().consumed == int(fixture.first.size()));
  }
  bool chatPrefix = false;
  for (const auto& c : chatq::decode("wozhidaole'meiwenti"))
    if (c.text == u"我知道了" && c.consumed == 11) chatPrefix = true;
  assert(chatPrefix); includes("meiwenti", u"没问题");
  for (const auto& phrase : chatq::phrases) {
    includes(phrase.code, phrase.text);
    const std::string initials = phrase.initials;
    if (initials.size() >= 2 && initials.size() <= 8) includes(initials, phrase.text);
  }
  // Backspace/retyping must not retain the prior phrase or its consumption.
  chatq::decode("jintianyoukongma"); chatq::decode("jintianyoukongm");
  assert(chatq::decode("jintianyoukongma").front().text == u"今天有空吗");
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
  std::cout << "PASS " << sizeof(chatq::phrases) / sizeof(chatq::phrases[0]) << " shared chat phrases and initials; offline Pinyin words, sentences, v, apostrophe, prefix selection, backspace, invalid input, 1000 random compositions; "
    << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count() << "ms fuzz\n";
}
