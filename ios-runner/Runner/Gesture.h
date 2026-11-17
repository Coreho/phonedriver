#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

BOOL PUGesture(NSArray *pointers, NSError **error);

/// Whether a notification banner covers the point, for a touch the host sends through the Simulator's HID port.
BOOL PUBannerAt(CGPoint point);

@class XCSynthesizedEventRecord;

BOOL PUSynthesize(XCSynthesizedEventRecord *record, NSTimeInterval timeout, NSError **error);

NS_ASSUME_NONNULL_END
