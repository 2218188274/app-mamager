#import "PinyinDecoder.h"
#include "PinyinCore/chatq_decoder.h"
@implementation CQPinyinCandidate
@end
@implementation CQPinyinDecoder
- (instancetype)initWithDictionary:(NSString *)dictionary userDictionary:(NSString *)user {
  self = [super init];
  if (self && !chatq::open(dictionary.UTF8String, user.UTF8String)) return nil;
  return self;
}
- (NSArray<CQPinyinCandidate *> *)decode:(NSString *)spelling {
  NSMutableArray<CQPinyinCandidate *> *result = [NSMutableArray array];
  for (const auto& word : chatq::decode(spelling.UTF8String)) {
    CQPinyinCandidate *item = [CQPinyinCandidate new];
    item.text = [[NSString alloc] initWithCharacters:reinterpret_cast<const unichar *>(word.text.data()) length:word.text.size()];
    item.consumed = word.consumed;
    [result addObject:item];
  }
  return result;
}
- (void)close { chatq::close(); }
@end
