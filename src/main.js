import { WorldManager } from './worldManager.js';
import { setupControls } from './controls.js';
import { state } from './gameState.js';
import { render, hangarItems } from './renderer.js';
import { applyPaint, buyUnlock, choosePaint } from './meta.js';
import { handleMove, handleExec } from './actions.js';
import { handleMenuInput, startNewExpedition } from './menuManager.js';

function init() {
    applyPaint();

    // 有存档 = 本局进行中；否则先进机库
    const hasSave = WorldManager.loadFromStorage(state);
    if (hasSave) {
        state.worldPos = { ...WorldManager.state.playerPos };
    }
    state.overlay = 'TITLE';

    const log = document.getElementById('log');
    const say = (text, color = '#55ff55') => { if (log) { log.style.color = color; log.innerText = text; } };

    function hangarSelect(idx) {
        const items = hangarItems();
        const it = items[idx];
        if (!it) return;
        state.hangarIndex = idx;
        if (it.kind === 'unlock') {
            const r = buyUnlock(it.index);
            say(r === 'OK' ? 'UPGRADE INSTALLED. APPLIES FROM NEXT RUN.' : r === 'MAXED' ? 'ALREADY MAXED.' : 'NOT ENOUGH DATA.', r === 'OK' ? '#55ff55' : '#ff5555');
        } else if (it.kind === 'paint') {
            const r = choosePaint(it.index);
            say(r === 'OK' ? 'FRESH PAINT APPLIED.' : 'NOT ENOUGH DATA.', r === 'OK' ? '#55ff55' : '#ff5555');
        } else if (state.runActive) {
            state.overlay = null;
        } else {
            startNewExpedition();
            state.overlay = 'BRIEFING';
        }
    }

    // 覆盖层打开时的按键
    function overlayExec() {
        switch (state.overlay) {
            case 'TITLE':
            case 'HELP':
                state.overlay = state.runActive ? null : 'HANGAR';
                break;
            case 'HANGAR':
                hangarSelect(state.hangarIndex);
                break;
            case 'BRIEFING':
                state.overlay = null;
                say('PROBE RIG ONLINE. FIND CARGO.');
                break;
            case 'WIN':
            case 'LOSE':
                state.overlay = 'HANGAR';
                state.hangarIndex = hangarItems().length - 1;
                break;
        }
        render();
    }

    function overlayMove(key) {
        if (state.overlay !== 'HANGAR') return;
        const n = hangarItems().length;
        if (key === 'w') state.hangarIndex = (state.hangarIndex - 1 + n) % n;
        if (key === 's') state.hangarIndex = (state.hangarIndex + 1) % n;
        render();
    }

    setupControls(
        (key) => {
            if (state.overlay) { overlayMove(key); return; }
            if (state.mode === 'MENU') {
                handleMenuInput(key);
                render();
            } else {
                handleMove(key);
            }
        },
        () => {
            if (state.overlay) { overlayExec(); return; }
            if (state.mode === 'MENU') {
                handleMenuInput('exec');
                render();
            } else {
                handleExec();
            }
        }
    );

    document.getElementById('btn-help').addEventListener('click', () => {
        if (['WIN', 'LOSE', 'BRIEFING'].includes(state.overlay)) return;
        state.overlay = state.overlay === 'HELP' ? null : 'HELP';
        if (!state.overlay && !state.runActive) state.overlay = 'HANGAR';
        render();
    });
    document.getElementById('btn-hangar').addEventListener('click', () => {
        if (['WIN', 'LOSE', 'BRIEFING'].includes(state.overlay)) return;
        if (state.overlay === 'HANGAR') { if (state.runActive) state.overlay = null; }
        else { state.overlay = 'HANGAR'; state.hangarIndex = 0; }
        render();
    });
    document.getElementById('overlay').addEventListener('click', (e) => {
        const item = e.target.closest('.h-item');
        if (item) { hangarSelect(Number(item.dataset.idx)); render(); return; }
        if (['TITLE', 'HELP', 'BRIEFING', 'WIN', 'LOSE'].includes(state.overlay)) overlayExec();
    });

    const importInput = document.getElementById('import-input');
    const importBtn = document.getElementById('btn-import');
    importBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                localStorage.setItem('scavenge_world_data', JSON.stringify(data));
                WorldManager.loadFromStorage(state);
                state.runActive = true;
                state.mode = 'WORLD';
                state.overlay = null;
                state.worldPos = { ...WorldManager.state.playerPos };
                document.getElementById('log').style.color = "#55ff55";
                document.getElementById('log').innerText = "SAVE IMPORTED SUCCESSFULLY.";
                render();
            } catch (err) {
                document.getElementById('log').style.color = "#ff5555";
                document.getElementById('log').innerText = "IMPORT FAILED: INVALID FILE.";
            }
        };
        reader.readAsText(file);
        importInput.value = '';
    });

    render();
}

init();