package com.genymobile.scrcpy.wrappers;

import com.genymobile.scrcpy.AndroidVersions;
import com.genymobile.scrcpy.util.Ln;

import android.os.Build;
import android.os.IInterface;
import android.os.SystemClock;

import java.lang.reflect.Method;

public final class PowerManager {

    private static final int USER_ACTIVITY_EVENT_OTHER = 0;
    private static final int USER_ACTIVITY_FLAG_NO_CHANGE_LIGHTS = 1;

    private final IInterface manager;
    private Method isScreenOnMethod;
    private Method userActivityMethod;

    static PowerManager create() {
        IInterface manager = ServiceManager.getService("power", "android.os.IPowerManager");
        return new PowerManager(manager);
    }

    private PowerManager(IInterface manager) {
        this.manager = manager;
    }

    private Method getIsScreenOnMethod() throws NoSuchMethodException {
        if (isScreenOnMethod == null) {
            if (Build.VERSION.SDK_INT >= AndroidVersions.API_34_ANDROID_14) {
                isScreenOnMethod = manager.getClass().getMethod("isDisplayInteractive", int.class);
            } else {
                isScreenOnMethod = manager.getClass().getMethod("isInteractive");
            }
        }
        return isScreenOnMethod;
    }

    public boolean isScreenOn(int displayId) {

        try {
            Method method = getIsScreenOnMethod();
            if (Build.VERSION.SDK_INT >= AndroidVersions.API_34_ANDROID_14) {
                return (boolean) method.invoke(manager, displayId);
            }
            return (boolean) method.invoke(manager);
        } catch (ReflectiveOperationException e) {
            Ln.e("Could not invoke method", e);
            return false;
        }
    }

    private Method getUserActivityMethod() throws NoSuchMethodException {
        if (userActivityMethod == null) {
            if (Build.VERSION.SDK_INT >= AndroidVersions.API_31_ANDROID_12) {
                // userActivity(int displayId, long time, int event, int flags);
                userActivityMethod = manager.getClass().getMethod("userActivity", int.class, long.class, int.class, int.class);
            } else {
                // userActivity(long time, int event, int flags);
                userActivityMethod = manager.getClass().getMethod("userActivity", long.class, int.class, int.class);
            }
        }
        return userActivityMethod;
    }

    /** Resets the screen-off timer of {@code displayId} without brightening it, so a screen that has dimmed stays dim. */
    public void userActivity(int displayId) {
        try {
            Method method = getUserActivityMethod();
            long time = SystemClock.uptimeMillis();
            if (Build.VERSION.SDK_INT >= AndroidVersions.API_31_ANDROID_12) {
                method.invoke(manager, displayId, time, USER_ACTIVITY_EVENT_OTHER, USER_ACTIVITY_FLAG_NO_CHANGE_LIGHTS);
                return;
            }
            method.invoke(manager, time, USER_ACTIVITY_EVENT_OTHER, USER_ACTIVITY_FLAG_NO_CHANGE_LIGHTS);
        } catch (ReflectiveOperationException e) {
            Ln.e("Could not invoke method", e);
        }
    }
}
