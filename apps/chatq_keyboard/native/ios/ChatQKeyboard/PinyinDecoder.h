#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface CQPinyinCandidate : NSObject
@property(nonatomic, copy) NSString *text;
@property(nonatomic) NSInteger consumed;
@end
@interface CQPinyinDecoder : NSObject
- (nullable instancetype)initWithDictionary:(NSString *)dictionary userDictionary:(NSString *)user NS_SWIFT_NAME(init(dictionary:userDictionary:));
- (NSArray<CQPinyinCandidate *> *)decode:(NSString *)spelling;
- (void)close;
@end
NS_ASSUME_NONNULL_END
