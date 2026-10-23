# Vendored offline Pinyin decoder

Source: https://android.googlesource.com/platform/packages/inputmethods/PinyinIME/
Revision: 49aebad1c1cfbbcaa9288ffed5161e79e57c3679
License: Apache-2.0 (original copyright headers and NOTICE retained).

Includes jni/include, jni/share, res/raw/dict_pinyin.dat. The system dictionary
contains the upstream vocabulary and frequency model. No runtime downloads.
ChatQ adds chatq_decoder.{h,cpp} and replaces the private cutils logging include
in userdict.cpp with portable logging, and explicitly includes sys/time.h in
userdict.h. flush_cache also guards an unopened user dictionary, so recovery
from a missing system dictionary cannot dereference a null file name.
matrixsearch.cpp uses a bounded vector for candidate deduplication scratch
instead of assuming unused candidate-buffer capacity (triggered by abbreviated
input in 64-bit debug builds). Decoding uses the system dictionary;
it does not upload input or learn/store typed messages.

Maximum composition: 39 ASCII Pinyin letters/separators, up to 16 decoded Hanzi.
Candidate 0 is a sentence; other candidates consume a prefix of the Pinyin.
The keyboard retains the unconsumed suffix after explicit selection.
