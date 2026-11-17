#import <XCTest/XCTest.h>

NS_ASSUME_NONNULL_BEGIN

NSDictionary *_Nullable PUSnapshot(NSInteger maxDepth, NSError **error);

// The app of the last snapshot: the one whose screen the daemon's points are in.
XCUIApplication *_Nullable PULastApplication(void);

NS_ASSUME_NONNULL_END
