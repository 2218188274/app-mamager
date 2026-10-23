#include <jni.h>
#include "chatq_decoder.h"
extern "C" JNIEXPORT jboolean JNICALL
Java_expo_modules_chatqkeyboard_PinyinEngine_nativeOpen(JNIEnv* env, jobject, jstring dict, jstring user) {
  const char* d = env->GetStringUTFChars(dict, nullptr);
  const char* u = env->GetStringUTFChars(user, nullptr);
  const bool result = chatq::open(d, u);
  env->ReleaseStringUTFChars(dict, d); env->ReleaseStringUTFChars(user, u);
  return result;
}
extern "C" JNIEXPORT void JNICALL
Java_expo_modules_chatqkeyboard_PinyinEngine_nativeClose(JNIEnv*, jobject) { chatq::close(); }
extern "C" JNIEXPORT jobjectArray JNICALL
Java_expo_modules_chatqkeyboard_PinyinEngine_nativeDecode(JNIEnv* env, jobject, jstring raw) {
  const char* value = env->GetStringUTFChars(raw, nullptr);
  const auto candidates = chatq::decode(value);
  env->ReleaseStringUTFChars(raw, value);
  // Two strings per candidate: Hanzi and number of ASCII Pinyin bytes consumed.
  auto result = env->NewObjectArray(candidates.size() * 2, env->FindClass("java/lang/String"), nullptr);
  for (size_t i = 0; i < candidates.size(); ++i) {
    auto text = env->NewString(reinterpret_cast<const jchar*>(candidates[i].text.data()), candidates[i].text.size());
    auto consumed = env->NewStringUTF(std::to_string(candidates[i].consumed).c_str());
    env->SetObjectArrayElement(result, i * 2, text); env->SetObjectArrayElement(result, i * 2 + 1, consumed);
    env->DeleteLocalRef(text); env->DeleteLocalRef(consumed);
  }
  return result;
}
