package dev.phonedriver.agent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * One screen a host connection works on: the phone's own, or a hidden display of its own (decision D73). A thread
 * belongs to the lane of the thread that started it, so everything a connection runs acts on that connection's screen.
 */
final class Lane {
    static final Lane MAIN = new Lane("", null);

    private static final InheritableThreadLocal<Lane> HERE = new InheritableThreadLocal<Lane>() {
        @Override
        protected Lane initialValue() {
            return MAIN;
        }
    };
    private static final Map<String, Lane> HIDDEN = new HashMap<>();
    private static final Set<String> OPENING = new HashSet<>();
    private static final Object ONE_OPEN = new Object();

    final String name;
    final Hidden hidden;
    volatile Control control;
    volatile boolean syncRequested;
    final ConcurrentLinkedQueue<long[]> barriers = new ConcurrentLinkedQueue<>();
    volatile long videoLagUs;
    volatile boolean closed;
    int screenW;
    int screenH;
    private boolean controlTaken;
    private boolean videoTaken;

    private Lane(String name, Hidden hidden) {
        this.name = name;
        this.hidden = hidden;
    }

    static Lane here() {
        return HERE.get();
    }

    void enter() {
        HERE.set(this);
    }

    int displayId() {
        return hidden == null ? 0 : hidden.id;
    }

    /** The lane a control connection asked for, with its display opened. Throws when the lane is taken or the phone gives no display. */
    static Lane claimControl(boolean hidden, String name) throws Exception {
        synchronized (Lane.class) {
            if (!hidden) {
                if (MAIN.controlTaken) {
                    throw new IllegalStateException("lane in use: the phone's own screen");
                }
                MAIN.controlTaken = true;
                return MAIN;
            }
            if (HIDDEN.containsKey(name) || !OPENING.add(name)) {
                throw new IllegalStateException("lane in use: " + (name.isEmpty() ? "hidden" : name));
            }
        }
        Lane lane = null;
        try {
            synchronized (ONE_OPEN) {
                lane = new Lane(name, Hidden.open(name));
            }
            lane.controlTaken = true;
            return lane;
        } finally {
            synchronized (Lane.class) {
                OPENING.remove(name);
                if (lane != null) {
                    HIDDEN.put(name, lane);
                }
            }
        }
    }



    /** The lane a video connection belongs to, or null when it has none open or already has its video. */
    static synchronized Lane claimVideo(boolean hidden, String name) {
        Lane lane = hidden ? HIDDEN.get(name) : MAIN;
        if (lane == null || lane.videoTaken) {
            return null;
        }
        lane.videoTaken = true;
        return lane;
    }

    static synchronized void release(Lane lane, int kind) {
        if (kind == 'C') {
            lane.controlTaken = false;
            if (lane.hidden != null) {
                lane.closed = true;
                HIDDEN.remove(lane.name);
                lane.hidden.close();
            }
        } else {
            lane.videoTaken = false;
        }
    }

    static synchronized List<Lane> all() {
        List<Lane> lanes = new ArrayList<>(HIDDEN.values());
        lanes.add(MAIN);
        return lanes;
    }
}
