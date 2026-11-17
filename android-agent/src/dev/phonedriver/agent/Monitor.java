package dev.phonedriver.agent;

import android.os.SystemClock;
import com.genymobile.scrcpy.display.DisplayInfo;
import com.genymobile.scrcpy.wrappers.ServiceManager;
import org.json.JSONObject;

final class Monitor {
    private static final long POLL_MS = 100;
    private static final long KEYGUARD_POLL_MS = 500;
    /** For this long after the host's last request, the phone's own screen is kept on (decision D86). */
    private static final long KEEP_AWAKE_MS = 600_000;
    /** Android's shortest screen timeout is 15 s, and the screen dims about 3 s before it goes off. */
    private static final long NUDGE_MS = 10_000;

    static void start() {
        Thread t = new Thread(Monitor::loop, "monitor");
        t.setDaemon(true);
        t.start();
    }

    private static void emit(JSONObject event) {
        Control c = Lane.here().control;
        if (c != null) {
            c.event(event);
        }
    }

    private static void loop() {
        DisplayInfo last = null;
        Boolean locked = null;
        Boolean screenOn = null;
        long keyguardAt = 0;
        long nudgedAt = 0;
        while (!Lane.here().closed) {
            try {
                DisplayInfo now = ServiceManager.getDisplayManager().getDisplayInfo(Hidden.displayId());
                if (last != null && (!now.getSize().equals(last.getSize()) || now.getRotation() != last.getRotation()
                        || now.getDpi() != last.getDpi())) {
                    JSONObject e = Json.put(new JSONObject(), "ev", "display_changed");
                    Json.put(e, "w", now.getSize().getWidth());
                    Json.put(e, "h", now.getSize().getHeight());
                    Json.put(e, "rotation", now.getRotation());
                    Json.put(e, "density", now.getDpi() / 160.0);
                    emit(e);
                }
                last = now;
                // The host reads the power state once and then trusts these events, so every change of the
                // screen or the lock is sent.
                boolean on = Hidden.active() || ServiceManager.getPowerManager().isScreenOn(0);
                boolean changed = screenOn != null && on != screenOn;
                screenOn = on;
                if (changed || SystemClock.uptimeMillis() - keyguardAt >= KEYGUARD_POLL_MS) {
                    keyguardAt = SystemClock.uptimeMillis();
                    boolean l = Keyguard.locked();
                    if (changed || (locked != null && l != locked)) {
                        JSONObject e = Json.put(new JSONObject(), "ev", "state");
                        emit(Json.put(Json.put(e, "locked", l), "screen_on", on));
                    }
                    locked = l;
                    Control c = Lane.here().control;
                    if (!l && c != null && keyguardAt - c.usedAt < KEEP_AWAKE_MS && keyguardAt - nudgedAt >= NUDGE_MS
                            && ServiceManager.getPowerManager().isScreenOn(0)) {
                        nudgedAt = keyguardAt;
                        ServiceManager.getPowerManager().userActivity(0);
                    }
                }
            } catch (Throwable t) {
                System.err.println("monitor: " + t);
                SystemClock.sleep(KEYGUARD_POLL_MS);
            }
            SystemClock.sleep(POLL_MS);
        }
    }

    private Monitor() {}
}
