package dev.phonedriver.agent;

import android.view.accessibility.AccessibilityWindowInfo;
import com.genymobile.scrcpy.wrappers.ServiceManager;
import java.util.List;
import org.json.JSONObject;

final class DeviceState {
    static JSONObject state() {
        boolean imeVisible = false;
        String foreground = null;
        boolean topSeen = false;
        List<AccessibilityWindowInfo> windows = Accessibility.windows();
        for (AccessibilityWindowInfo w : windows) {
            if (w.getType() == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                imeVisible = true;
            }
            if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) {
                continue;
            }
            // isActive() is one flag for the whole phone: with two lanes open, only the display touched last had an
            // active window and the other lane read no app in front (API 37). A display's windows come topmost first.
            if (Hidden.active() ? !topSeen : foreground == null && w.isActive()) {
                foreground = Accessibility.packageOf(w);
            }
            topSeen = true;
        }
        JSONObject r = new JSONObject();
        Json.put(r, "screen_on", Hidden.active() || ServiceManager.getPowerManager().isScreenOn(0));
        Json.put(r, "locked", !Hidden.active() && Keyguard.locked());
        Json.put(r, "secure_keyguard", !Hidden.active() && Keyguard.secure());
        Json.put(r, "ime_visible", imeVisible);
        Json.put(r, "foreground", foreground == null ? JSONObject.NULL : foreground);
        return r;
    }

    static JSONObject power() {
        JSONObject r = new JSONObject();
        Json.put(r, "screen_on", Hidden.active() || ServiceManager.getPowerManager().isScreenOn(0));
        Json.put(r, "locked", !Hidden.active() && Keyguard.locked());
        Json.put(r, "secure_keyguard", !Hidden.active() && Keyguard.secure());
        boolean focused = false;
        for (AccessibilityWindowInfo w : Accessibility.windows()) {
            focused |= w.isFocused();
        }
        Json.put(r, "focused", focused);
        return r;
    }

    private DeviceState() {}
}
