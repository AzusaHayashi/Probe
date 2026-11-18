// Self-contained Web Audio effects. Call playSound/unlockAudio from an input
// handler when possible: browsers can block audio until a user gesture.
// Events: move, turn, door-open, door-close, scanner, vent, creature,
// drone-lost, cargo, evac, blocked, select. Unknown names are ignored.

const STORAGE_KEY = 'probe-sound-enabled';
const MASTER_LEVEL = 0.65;
const MAX_VOICES = 12;
const PENDING_SOUND_LIFETIME = 700; // Don't replay stale events after autoplay unlock.

function loadPreference() {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) !== 'false';
    } catch (_) {
        return true;
    }
}

let enabled = loadPreference();
let audioContext = null;
let master = null;
let noiseBuffer = null;
let pendingSound = null;
const activeVoices = new Set();

function disconnect(node) {
    try { node.disconnect(); } catch (_) { /* Already disconnected. */ }
}

function stopVoices() {
    for (const voice of Array.from(activeVoices)) {
        try { voice.source.stop(); } catch (_) { /* Already stopped. */ }
        voice.cleanup();
    }
}

function getContext() {
    if (!enabled) return null;
    if (audioContext && audioContext.state === 'closed') {
        stopVoices();
        audioContext = null;
        master = null;
        noiseBuffer = null;
    }
    if (audioContext) return audioContext;

    // Browsers expose constructors on window; the fallback also makes this
    // module harmless in environments without a DOM or an audio implementation.
    const root = typeof window !== 'undefined' ? window : globalThis;
    const Context = root.AudioContext || root.webkitAudioContext;
    if (!Context) return null;

    let context;
    try {
        context = new Context();
        const output = context.createGain();
        output.gain.value = MASTER_LEVEL;
        output.connect(context.destination);
        audioContext = context;
        master = output;
        return context;
    } catch (_) {
        // A partially created context should not leak if initialization fails.
        try {
            const closing = context?.close();
            if (closing && typeof closing.catch === 'function') closing.catch(() => {});
        } catch (_) { /* Nothing else to clean up. */ }
        return null;
    }
}

// Each source owns its envelope/filter nodes and disconnects them on completion.
// The voice cap and quiet master keep overlapping effects safely below clipping.
function startVoice(context, source, filter, when, duration, level) {
    if (activeVoices.size >= MAX_VOICES) return;
    let envelope;
    let voice;
    try {
        envelope = context.createGain();
        const attack = Math.min(0.008, duration / 4);
        envelope.gain.setValueAtTime(0, when);
        envelope.gain.linearRampToValueAtTime(level, when + attack);
        envelope.gain.linearRampToValueAtTime(level * 0.65, when + duration * 0.42);
        envelope.gain.linearRampToValueAtTime(0, when + duration);
        if (filter) {
            source.connect(filter);
            filter.connect(envelope);
        } else {
            source.connect(envelope);
        }
        envelope.connect(master);
        voice = {
            source,
            cleanup() {
                if (!activeVoices.delete(voice)) return;
                source.onended = null;
                disconnect(source);
                if (filter) disconnect(filter);
                disconnect(envelope);
            },
        };
        activeVoices.add(voice);
        source.onended = voice.cleanup;
        source.start(when);
        source.stop(when + duration + 0.01);
    } catch (_) {
        if (voice) {
            try { source.stop(); } catch (_) { /* Not started. */ }
            voice.cleanup();
        } else {
            disconnect(source);
            if (filter) disconnect(filter);
            if (envelope) disconnect(envelope);
        }
    }
}

function tone(context, when, duration, from, to, level, type = 'sine') {
    if (activeVoices.size >= MAX_VOICES) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, when);
    oscillator.frequency.exponentialRampToValueAtTime(to, when + duration);
    startVoice(context, oscillator, null, when, duration, level);
}

function noise(context, when, duration, from, to, level, type = 'bandpass') {
    if (activeVoices.size >= MAX_VOICES) return;
    if (!noiseBuffer) {
        // Reuse a short generated noise buffer; no external sound files needed.
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.8), context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, when);
    filter.frequency.exponentialRampToValueAtTime(to, when + duration);
    startVoice(context, source, filter, when, duration, level);
}

// All sound layers stay short and quiet; mechanical noises and tonal cues are
// deliberately different so events remain readable during quick play.
const effects = {
    move(c, t) {
        tone(c, t, 0.075, 155, 90, 0.075, 'triangle');
        noise(c, t, 0.045, 700, 330, 0.055);
    },
    turn(c, t) {
        tone(c, t, 0.11, 260, 390, 0.065, 'triangle');
        noise(c, t, 0.045, 1100, 600, 0.04);
    },
    'door-open'(c, t) {
        tone(c, t, 0.34, 100, 210, 0.065, 'sawtooth');
        noise(c, t, 0.32, 450, 1400, 0.07);
        tone(c, t + 0.27, 0.12, 470, 620, 0.04, 'triangle');
    },
    'door-close'(c, t) {
        tone(c, t, 0.31, 215, 78, 0.065, 'sawtooth');
        noise(c, t, 0.3, 1200, 350, 0.065);
        tone(c, t + 0.27, 0.13, 95, 45, 0.09, 'triangle');
    },
    scanner(c, t) {
        tone(c, t, 0.19, 1420, 1020, 0.075);
        tone(c, t + 0.15, 0.2, 1420, 1020, 0.025);
    },
    vent(c, t) {
        noise(c, t, 0.55, 320, 1550, 0.09);
        tone(c, t, 0.46, 85, 60, 0.04, 'triangle');
    },
    creature(c, t) {
        tone(c, t, 0.5, 112, 53, 0.07, 'sawtooth');
        tone(c, t + 0.03, 0.43, 119, 68, 0.045, 'triangle');
        noise(c, t + 0.04, 0.38, 500, 180, 0.06, 'lowpass');
    },
    'drone-lost'(c, t) {
        tone(c, t, 0.23, 650, 310, 0.07, 'square');
        tone(c, t + 0.23, 0.37, 390, 115, 0.075, 'triangle');
        noise(c, t + 0.28, 0.25, 800, 170, 0.06, 'lowpass');
    },
    cargo(c, t) {
        tone(c, t, 0.13, 540, 680, 0.06, 'triangle');
        tone(c, t + 0.11, 0.2, 790, 980, 0.055, 'sine');
    },
    evac(c, t) {
        tone(c, t, 0.2, 330, 370, 0.06, 'triangle');
        tone(c, t + 0.15, 0.2, 495, 550, 0.06, 'triangle');
        tone(c, t + 0.3, 0.34, 740, 880, 0.065, 'sine');
    },
    blocked(c, t) {
        tone(c, t, 0.09, 170, 140, 0.07, 'square');
        tone(c, t + 0.12, 0.12, 140, 100, 0.065, 'square');
    },
    select(c, t) {
        tone(c, t, 0.075, 760, 920, 0.055, 'sine');
    },
};

function renderSound(context, name) {
    try {
        effects[name](context, context.currentTime + 0.01);
    } catch (_) {
        // Audio is optional: an unavailable or failing node must not stop play.
    }
}

function flushPending(context) {
    if (!enabled || context !== audioContext || context.state !== 'running') return;
    const pending = pendingSound;
    pendingSound = null;
    if (pending && Date.now() - pending.created < PENDING_SOUND_LIFETIME) {
        renderSound(context, pending.name);
    }
}

function resumeContext(context) {
    if (context.state === 'running') {
        flushPending(context);
        return;
    }
    try {
        // Call resume synchronously in the input handler, not in a timer.
        const result = context.resume();
        if (result && typeof result.then === 'function') {
            result.then(() => flushPending(context)).catch(() => {});
        } else {
            flushPending(context);
        }
    } catch (_) { /* Autoplay policy or device failure: silently try later. */ }
}

/** Attempt to initialize/resume audio from a user gesture, without playing a cue. */
export function unlockAudio() {
    try {
        const context = getContext();
        if (context) resumeContext(context);
    } catch (_) { /* Sound must never interrupt the game. */ }
}

/** Play a named effect; silently ignores unknown names and unsupported audio. */
export function playSound(name) {
    if (!enabled || typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(effects, name)) return;
    try {
        const context = getContext();
        if (!context) return;
        if (context.state === 'running') {
            pendingSound = null;
            renderSound(context, name);
        } else {
            // Keep only the latest event while a browser is waiting for a gesture.
            pendingSound = { name, created: Date.now() };
            resumeContext(context);
        }
    } catch (_) { /* Sound must never interrupt the game. */ }
}

/** Toggle and persist sound, returning its new enabled state. */
export function toggleSound() {
    enabled = !enabled;
    try { globalThis.localStorage?.setItem(STORAGE_KEY, String(enabled)); } catch (_) { /* Storage may be blocked. */ }
    if (enabled) {
        // Toggling on is itself normally a user gesture, so resume immediately.
        unlockAudio();
    } else {
        pendingSound = null;
        stopVoices();
    }
    return enabled;
}

/** Return the current sound preference (enabled by default). */
export function isSoundEnabled() {
    return enabled;
}
