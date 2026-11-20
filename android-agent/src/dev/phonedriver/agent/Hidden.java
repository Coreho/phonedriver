package dev.phonedriver.agent;

import android.hardware.display.VirtualDisplay;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.os.Build;
import android.view.Surface;
import com.genymobile.scrcpy.display.DisplayInfo;
import com.genymobile.scrcpy.wrappers.ServiceManager;
import com.genymobile.scrcpy.wrappers.WindowManager;

/** A virtual display with its encoder. The static methods answer for the lane of the calling thread. */
final class Hidden {
    private static final int MIN_API = 33;
    private static final int PUBLIC = 1;
    private static final int PRESENTATION = 1 << 1;
    private static final int OWN_CONTENT_ONLY = 1 << 3;
    private static final int SUPPORTS_TOUCH = 1 << 6;
    private static final int ROTATES_WITH_CONTENT = 1 << 7;
    private static final int DESTROY_CONTENT_ON_REMOVAL = 1 << 8;
    private static final int SHOULD_SHOW_SYSTEM_DECORATIONS = 1 << 9;
    private static final int TRUSTED = 1 << 10;
    private static final int OWN_DISPLAY_GROUP = 1 << 11;
    private static final int ALWAYS_UNLOCKED = 1 << 12;
    private static final int TOUCH_FEEDBACK_DISABLED = 1 << 13;
    private static final int OWN_FOCUS = 1 << 14;
    private static final int DEVICE_DISPLAY_GROUP = 1 << 15;
    private static final int[] SIZE_FALLBACK = {0, 2560, 1920, 1600, 1280, 1024, 800};
    // A software encoder, which is what every emulator has, does not keep up with a phone panel at 30 frames a
    // second: on the API 37 emulator a lane's frames left the encoder a median 598 ms after the screen showed them
    // (p90 899 ms), and 43 ms (p90 118 ms) at two pixels a point and 15 frames a second. A screenshot is one pixel a
    // point and text is read from pixels at two, so nothing the host uses is lost.
    private static final int SOFTWARE_PIXELS_PER_POINT = 2;
    private static final int SOFTWARE_FPS = 15;

    final int id;
    private final VirtualDisplay display;
    private final MediaCodec codec;
    private final GlRelay relay;
    private final int width;
    private final int height;

    private Hidden(VirtualDisplay display, MediaCodec codec, GlRelay relay, int width, int height) {
        this.display = display;
        this.id = display.getDisplay().getDisplayId();
        this.codec = codec;
        this.relay = relay;
        this.width = width;
        this.height = height;
    }

    static boolean active() {
        return Lane.here().hidden != null;
    }

    static int displayId() {
        return Lane.here().displayId();
    }

    static MediaCodec codec() {
        return Lane.here().hidden.codec;
    }

    static int width() {
        return Lane.here().hidden.width;
    }

    static int height() {
        return Lane.here().hidden.height;
    }

    private static IllegalStateException unavailable(String why) {
        System.err.println("hidden display: " + why);
        return new IllegalStateException("hidden display: " + why);
    }

    private static int flags() {
        // DESTROY_CONTENT_ON_REMOVAL: without it the apps on the display move to the phone's own screen when it goes.
        int flags = PUBLIC | PRESENTATION | OWN_CONTENT_ONLY | SUPPORTS_TOUCH | ROTATES_WITH_CONTENT
                | DESTROY_CONTENT_ON_REMOVAL | SHOULD_SHOW_SYSTEM_DECORATIONS
                | TRUSTED | OWN_DISPLAY_GROUP | ALWAYS_UNLOCKED | TOUCH_FEEDBACK_DISABLED;
        if (Build.VERSION.SDK_INT >= 34) {
            flags |= OWN_FOCUS | DEVICE_DISPLAY_GROUP;
        }
        return flags;
    }

    static Hidden open(String lane) throws Exception {
        if (Build.VERSION.SDK_INT < MIN_API) {
            throw unavailable("needs Android 13 (API 33) or newer, this is API " + Build.VERSION.SDK_INT);
        }
        // Seen on a HONOR X8 (Android 13, PIN), 2026-11-16: creating a virtual display turns the screen of a locked,
        // sleeping phone on for ten seconds, and the display then shows the keyguard's clock and starts no app.
        if (Keyguard.locked()) {
            throw new IllegalStateException("the phone is locked");
        }
        DisplayInfo main = ServiceManager.getDisplayManager().getDisplayInfo(0);
        int mainW = main.getSize().getWidth();
        int mainH = main.getSize().getHeight();
        MediaCodec encoder = MediaCodec.createEncoderByType("video/avc");
        MediaCodecInfo.VideoCapabilities caps =
                encoder.getCodecInfo().getCapabilitiesForType("video/avc").getVideoCapabilities();
        int align = Math.max(caps.getWidthAlignment(), caps.getHeightAlignment());
        boolean software = encoder.getCodecInfo().isSoftwareOnly();
        int cap = software ? SOFTWARE_PIXELS_PER_POINT * Math.max(mainW, mainH) * 160 / main.getDpi() : 0;
        int fps = software ? SOFTWARE_FPS : Video.FPS;
        Surface surface = null;
        int[] size = null;
        Exception last = null;
        for (int maxSize : SIZE_FALLBACK) {
            size = Video.fit(mainW, mainH, cap > 0 && (maxSize == 0 || maxSize > cap) ? cap : maxSize, align);
            try {
                encoder.configure(Video.format(size[0], size[1], fps), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                surface = encoder.createInputSurface();
                break;
            } catch (Exception e) {
                last = e;
                System.err.println("encoder rejected " + size[0] + "x" + size[1] + ": " + e);
                encoder.reset();
            }
        }
        if (surface == null) {
            encoder.release();
            throw unavailable("no encoder size works: " + last);
        }
        int dpi = Math.round(main.getDpi() * (float) size[0] / mainW);
        GlRelay relay = null;
        if (GlRelay.wanted()) {
            try {
                relay = GlRelay.start(size[0], size[1], surface);
            } catch (Exception e) {
                System.err.println("hidden display: no OpenGL relay, rendering straight to the encoder: " + e);
            }
        }
        VirtualDisplay display;
        try {
            display = ServiceManager.getDisplayManager().createNewVirtualDisplay(
                    lane.isEmpty() ? "phonedriver" : "phonedriver-" + lane, size[0], size[1], dpi,
                    relay != null ? relay.input() : surface, flags());
        } catch (Exception e) {
            Throwable cause = e instanceof java.lang.reflect.InvocationTargetException && e.getCause() != null ? e.getCause() : e;
            if (relay != null) {
                relay.release();
            }
            encoder.release();
            throw unavailable("the system refused a virtual display: " + cause);
        }
        Hidden hidden = new Hidden(display, encoder, relay, size[0], size[1]);
        // A display that shows system decorations keeps its own keyboard; otherwise the keyboard opens on the phone's screen.
        ServiceManager.getWindowManager().setDisplayImePolicy(hidden.id, WindowManager.DISPLAY_IME_POLICY_LOCAL);
        encoder.start();
        System.err.println("hidden display " + hidden.id + ": " + hidden.width + "x" + hidden.height + " at " + dpi + " dpi");
        return hidden;
    }

    void close() {
        try {
            display.release();
            if (relay != null) {
                relay.release();
            }
            codec.stop();
            codec.release();
        } catch (Exception e) {
            System.err.println("hidden display " + id + " did not close cleanly: " + e);
        }
    }
}
