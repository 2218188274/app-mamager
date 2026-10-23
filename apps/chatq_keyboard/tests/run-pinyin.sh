#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
output="$(mktemp -d)"
trap 'rm -rf "$output"' EXIT
core=modules/chatq-keyboard/vendor/pinyin
${CXX:-c++} -std=c++17 -O1 -g -I "$core" "$core"/jni/share/*.cpp "$core/chatq_decoder.cpp" tests/pinyin_decoder_test.cpp -o "$output/pinyin-test"
"$output/pinyin-test" "$core/res/raw/dict_pinyin.dat" "$output/user.dat"
