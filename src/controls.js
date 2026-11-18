/**
 * Bind keyboard and native touch/mouse/keyboard buttons. Movement retains
 * key-repeat; EXEC and the optional one-shot actions never auto-repeat.
 */
export function setupControls(onMove, onExec, onScan, onVent, onSound) {
    const keyMap = {
        w: 'w', arrowup: 'w',
        s: 's', arrowdown: 's',
        a: 'a', arrowleft: 'a',
        d: 'd', arrowright: 'd'
    };
    const actionMap = {
        ' ': onExec,
        enter: onExec,
        p: onScan,
        v: onVent,
        m: onSound
    };

    window.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        const target = event.target;
        const tagName = target?.tagName?.toLowerCase();
        if (target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName)) return;

        const key = event.key.toLowerCase();
        // Focused buttons handle Space/Enter through their native click. Avoid
        // repeated Enter clicks when a key is held down.
        if (tagName === 'button' && (key === ' ' || key === 'enter')) {
            if (event.repeat) event.preventDefault();
            return;
        }
        if (keyMap[key]) {
            event.preventDefault();
            onMove?.(keyMap[key]);
        } else if (Object.prototype.hasOwnProperty.call(actionMap, key)) {
            event.preventDefault();
            if (!event.repeat) actionMap[key]?.();
        }
    });

    // Native clicks support touch, mouse, keyboard, and assistive technology.
    const buttons = [
        ['btn-up', () => onMove?.('w')],
        ['btn-down', () => onMove?.('s')],
        ['btn-left', () => onMove?.('a')],
        ['btn-right', () => onMove?.('d')],
        ['btn-exec', () => onExec?.()],
        ['btn-scan', () => onScan?.()],
        ['btn-vent', () => onVent?.()],
        ['btn-sound', () => onSound?.()]
    ];
    buttons.forEach(([id, handler]) => {
        const button = document.getElementById(id);
        if (button) button.onclick = handler;
    });
}
