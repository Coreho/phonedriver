// simio: touches for one booted iOS Simulator, sent through the Simulator's own HID port instead of XCTest
// (decision D93). phonedriver compiles it with Xcode's clang on first use and talks to it over stdin and stdout.
//
//   simio <udid> <developer dir> touch
//   simio <udid> <developer dir> frames <pixels per point>
//
// It prints {"ok":true} once it holds the device, or {"ok":false,"error":...} and exits.
// touch: each line on stdin is a request and gets one line of reply:
//   {"op":"touch","path":[{"x":10,"y":20,"t_ms":0},...]}  one finger, in portrait points, down at the first point,
//                                                          moved through the others at their times, up at the last.
// frames: a line {"w":..,"h":..,"y":"<base64>"} with the screen's luma, scaled down by averaging, each time the
// Simulator's screen buffer is written, at most every 16 ms, and {"locked":true|false} first and whenever
// SpringBoard's lock state changes. It exits when phonedriver or the Simulator stops.
//
// SimulatorKit and CoreSimulator are private frameworks with no headers, so every class is looked up by name and
// every method is sent through objc_msgSend. The Indigo message layout is the one idb documents
// (github.com/facebook/idb, PrivateHeaders/SimulatorApp/Indigo.h, MIT).

#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <IOSurface/IOSurface.h>
#import <dlfcn.h>
#import <mach/mach_time.h>
#import <objc/message.h>
#import <objc/runtime.h>

typedef void *(*PUMouseMessage)(CGPoint *, CGPoint *, int, int, BOOL);

static const int PUTargetDigitizer = 0x32;
static const int PUDown = 1, PUUp = 2;
// sizeof(IndigoPayload) and sizeof(IndigoMessage) + sizeof(IndigoPayload) in Indigo.h's packed layout.
static const size_t PUPayloadSize = 0x90, PUTouchMessageSize = 0x140;
static const size_t PUTouchSize = 0x70;

static id PUClient;
static PUMouseMessage PUMouse;
static CGSize PUPixels;
static double PUScale;

static void PUReply(NSDictionary *reply)
{
    NSData *data = [NSJSONSerialization dataWithJSONObject:reply options:0 error:NULL];
    fwrite(data.bytes, 1, data.length, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static void PUFail(NSString *error)
{
    PUReply(@{@"ok": @NO, @"error": error});
    exit(1);
}

static id PUSend(id target, const char *selector)
{
    return ((id (*)(id, SEL))objc_msgSend)(target, sel_registerName(selector));
}

// Xcode 27 keeps SimulatorKit in SharedFrameworks; Xcode 16 kept it in the developer dir's PrivateFrameworks.
static void *PUOpenSimulatorKit(NSString *developer)
{
    NSArray *paths = @[
        [developer stringByAppendingPathComponent:@"../SharedFrameworks/SimulatorKit.framework/SimulatorKit"],
        [developer stringByAppendingPathComponent:@"Library/PrivateFrameworks/SimulatorKit.framework/SimulatorKit"],
    ];
    for (NSString *path in paths) {
        void *handle = dlopen(path.stringByStandardizingPath.fileSystemRepresentation, RTLD_NOW);
        if (handle) return handle;
    }
    return NULL;
}

static id PUDevice(NSString *udid, NSString *developer)
{
    if (!dlopen("/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator", RTLD_NOW)) {
        PUFail([NSString stringWithFormat:@"cannot load CoreSimulator: %s", dlerror()]);
    }
    NSError *error = nil;
    id context = ((id (*)(id, SEL, id, NSError **))objc_msgSend)(
        NSClassFromString(@"SimServiceContext"), sel_registerName("sharedServiceContextForDeveloperDir:error:"),
        developer, &error);
    if (!context) PUFail([NSString stringWithFormat:@"no CoreSimulator service: %@", error]);
    id set = ((id (*)(id, SEL, NSError **))objc_msgSend)(context, sel_registerName("defaultDeviceSetWithError:"),
                                                         &error);
    if (!set) PUFail([NSString stringWithFormat:@"no device set: %@", error]);
    NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:udid];
    id device = uuid ? [PUSend(set, "devicesByUDID") objectForKey:uuid] : nil;
    if (!device) PUFail([NSString stringWithFormat:@"no Simulator %@", udid]);
    return device;
}

static void PUWrite(void *base, size_t offset, const void *value, size_t size)
{
    memcpy((uint8_t *)base + offset, value, size);
}

// One touch event, as idb's touchMessage builds it: SimulatorKit makes the digitizer payload, which is copied into
// a two-payload touch message with the coordinates written in.
static void *PUTouchMessage(CGPoint ratio, int direction)
{
    CGPoint point = ratio;
    uint8_t *source = PUMouse(&point, NULL, PUTargetDigitizer, direction, NO);
    PUWrite(source, 0x3C, &ratio.x, sizeof(double));
    PUWrite(source, 0x44, &ratio.y, sizeof(double));
    uint8_t *message = calloc(1, PUTouchMessageSize);
    uint32_t inner = (uint32_t)PUPayloadSize, kind = 0xB;
    uint64_t now = mach_absolute_time();
    PUWrite(message, 0x18, &inner, sizeof inner);
    message[0x1C] = 2;
    PUWrite(message, 0x20, &kind, sizeof kind);
    PUWrite(message, 0x24, &now, sizeof now);
    memcpy(message + 0x30, source + 0x30, PUTouchSize);
    free(source);
    memcpy(message + 0x20 + PUPayloadSize, message + 0x20, PUPayloadSize);
    uint32_t one = 1, two = 2;
    PUWrite(message, 0x30 + PUPayloadSize, &one, sizeof one);
    PUWrite(message, 0x34 + PUPayloadSize, &two, sizeof two);
    return message;
}

static NSString *PUDeliver(void *message)
{
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    __block NSString *failure = nil;
    ((void (*)(id, SEL, void *, BOOL, dispatch_queue_t, void (^)(NSError *)))objc_msgSend)(
        PUClient, sel_registerName("sendWithMessage:freeWhenDone:completionQueue:completion:"), message, YES,
        dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0), ^(NSError *error) {
            if (error) failure = error.localizedDescription;
            dispatch_semaphore_signal(done);
        });
    if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) != 0) {
        return @"the Simulator did not take the touch within 5 s";
    }
    return failure;
}

static NSDictionary *PUTouch(NSArray *path)
{
    if (![path isKindOfClass:NSArray.class] || path.count == 0) return @{@"ok": @NO, @"error": @"path is empty"};
    uint64_t start = mach_absolute_time();
    mach_timebase_info_data_t base;
    mach_timebase_info(&base);
    CGPoint last = CGPointMake(NAN, NAN);
    double lastT = NAN;
    for (NSUInteger i = 0; i < path.count; i++) {
        NSDictionary *p = path[i];
        double x = [p[@"x"] doubleValue], y = [p[@"y"] doubleValue], t = [p[@"t_ms"] doubleValue];
        mach_wait_until(start + (uint64_t)(t * 1e6 * base.denom / base.numer));
        CGPoint ratio = CGPointMake(x * PUScale / PUPixels.width, y * PUScale / PUPixels.height);
        NSString *failure = nil;
        // A point held still is sent again, so the app sees the finger stop before the lift; a tap's lift at the
        // same moment and place as its press is not a move.
        if (!(CGPointEqualToPoint(ratio, last) && t == lastT)) failure = PUDeliver(PUTouchMessage(ratio, PUDown));
        if (!failure && i + 1 == path.count) failure = PUDeliver(PUTouchMessage(ratio, PUUp));
        if (failure) return @{@"ok": @NO, @"error": failure};
        last = ratio;
        lastT = t;
    }
    return @{@"ok": @YES};
}

// The main display's descriptor among the device's IO ports, as idb's FBFramebuffer finds it.
static id PUDisplay(id device)
{
    for (id port in PUSend(PUSend(device, "io"), "ioPorts")) {
        id descriptor = [port respondsToSelector:sel_registerName("descriptor")] ? PUSend(port, "descriptor") : nil;
        if (![descriptor respondsToSelector:sel_registerName("framebufferSurface")]) continue;
        id state = [descriptor respondsToSelector:sel_registerName("state")] ? PUSend(descriptor, "state") : nil;
        // The state is a remote proxy, which key-value coding does not reach.
        if (state && ((unsigned short (*)(id, SEL))objc_msgSend)(state, sel_registerName("displayClass")) != 0) continue;
        return descriptor;
    }
    return nil;
}

static uint64_t PUNowMs(void)
{
    return clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / 1000000;
}

// The screen's luma, each output pixel the mean of every other pixel of a block x block square.
static void PUEmitLuma(IOSurfaceRef surface, size_t block)
{
    IOSurfaceLock(surface, kIOSurfaceLockReadOnly, NULL);
    size_t width = IOSurfaceGetWidth(surface) / block, height = IOSurfaceGetHeight(surface) / block;
    size_t row = IOSurfaceGetBytesPerRow(surface), element = IOSurfaceGetBytesPerElement(surface);
    const uint8_t *base = IOSurfaceGetBaseAddress(surface);
    NSMutableData *luma = [NSMutableData dataWithLength:width * height];
    uint8_t *out = luma.mutableBytes;
    for (size_t y = 0; y < height; y++) {
        for (size_t x = 0; x < width; x++) {
            uint32_t sum = 0, count = 0;
            for (size_t dy = 0; dy < block; dy += 2) {
                const uint8_t *p = base + (y * block + dy) * row + x * block * element;
                for (size_t dx = 0; dx < block; dx += 2, p += 2 * element) {
                    sum += (p[2] * 77 + p[1] * 150 + p[0] * 29) >> 8;
                    count++;
                }
            }
            out[y * width + x] = (uint8_t)(sum / count);
        }
    }
    IOSurfaceUnlock(surface, kIOSurfaceLockReadOnly, NULL);
    printf("{\"w\":%zu,\"h\":%zu,\"y\":\"%s\"}\n", width, height, [luma base64EncodedStringWithOptions:0].UTF8String);
    fflush(stdout);
}

static void PUFrames(id device, double pixelsPerPoint)
{
    id display = PUDisplay(device);
    if (!display) PUFail(@"the Simulator has no main display port");
    double scale = [[PUSend(device, "deviceType") valueForKey:@"mainScreenScale"] doubleValue];
    size_t block = MAX(1, (size_t)floor(scale / pixelsPerPoint));
    id surface = PUSend(display, "framebufferSurface");
    if (!surface) PUFail(@"the Simulator's display has no screen buffer yet");
    if (IOSurfaceGetBytesPerElement((__bridge IOSurfaceRef)surface) != 4) PUFail(@"the screen buffer is not 32-bit");
    PUReply(@{@"ok": @YES});
    pid_t parent = getppid();
    uint32_t shown = 0;
    BOOL fresh = YES;
    uint64_t emitted = 0, looked = PUNowMs(), checked = PUNowMs(), lockRead = 0;
    int locked = -1;
    for (;;) {
        @autoreleasepool {
            uint64_t now = PUNowMs();
            if (now - lockRead >= 250) {
                lockRead = now;
                unsigned long long state = 0;
                ((BOOL (*)(id, SEL, unsigned long long *, NSString *, NSError **))objc_msgSend)(
                    device, sel_registerName("darwinNotificationGetState:name:error:"), &state,
                    @"com.apple.springboard.lockstate", NULL);
                if ((int)(state != 0) != locked) {
                    locked = state != 0;
                    printf("{\"locked\":%s}\n", locked ? "true" : "false");
                    fflush(stdout);
                }
            }
            if (now - looked >= 100) {
                looked = now;
                id current = PUSend(display, "framebufferSurface");
                if (current && current != surface) {
                    surface = current;
                    fresh = YES;
                }
            }
            if (now - checked >= 1000) {
                checked = now;
                if (getppid() != parent || [[device valueForKey:@"state"] integerValue] != 3) exit(0);
            }
            IOSurfaceRef ref = (__bridge IOSurfaceRef)surface;
            uint32_t seed = IOSurfaceGetSeed(ref);
            if ((fresh || seed != shown) && now - emitted >= 16) {
                shown = seed;
                fresh = NO;
                emitted = now;
                PUEmitLuma(ref, block);
            }
        }
        usleep(4000);
    }
}

int main(int argc, const char *argv[])
{
    @autoreleasepool {
        BOOL frames = argc == 5 && strcmp(argv[3], "frames") == 0;
        if (!frames && !(argc == 4 && strcmp(argv[3], "touch") == 0)) {
            PUFail(@"usage: simio <udid> <developer dir> touch | frames <pixels per point>");
        }
        NSString *udid = @(argv[1]), *developer = @(argv[2]);
        id device = PUDevice(udid, developer);
        if (frames) PUFrames(device, atof(argv[4]));
        void *kit = PUOpenSimulatorKit(developer);
        if (!kit) PUFail([NSString stringWithFormat:@"cannot load SimulatorKit: %s", dlerror()]);
        PUMouse = (PUMouseMessage)dlsym(kit, "IndigoHIDMessageForMouseNSEvent");
        Class clientClass = objc_lookUpClass("SimulatorKit.SimDeviceLegacyHIDClient");
        if (!PUMouse || !clientClass) PUFail(@"this Xcode's SimulatorKit has no Indigo HID client");
        NSError *error = nil;
        PUClient = ((id (*)(id, SEL, id, NSError **))objc_msgSend)(
            PUSend(clientClass, "alloc"), sel_registerName("initWithDevice:error:"), device, &error);
        if (!PUClient) PUFail([NSString stringWithFormat:@"no HID client: %@", error]);
        id type = PUSend(device, "deviceType");
        PUPixels = [[type valueForKey:@"mainScreenSize"] sizeValue];
        PUScale = [[type valueForKey:@"mainScreenScale"] doubleValue];
        if (PUPixels.width <= 0 || PUPixels.height <= 0 || PUScale <= 0) PUFail(@"the device type has no screen size");
        PUReply(@{@"ok": @YES});
        char *line = NULL;
        size_t capacity = 0;
        while (getline(&line, &capacity, stdin) > 0) {
            @autoreleasepool {
                NSData *data = [NSData dataWithBytes:line length:strlen(line)];
                NSDictionary *request = [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
                if (![request isKindOfClass:NSDictionary.class]) {
                    PUReply(@{@"ok": @NO, @"error": @"a request is one JSON object per line"});
                } else if ([request[@"op"] isEqual:@"touch"]) {
                    PUReply(PUTouch(request[@"path"]));

                } else {
                    PUReply(@{@"ok": @NO, @"error": [NSString stringWithFormat:@"unknown op %@", request[@"op"]]});
                }
            }
        }
    }
    return 0;
}
