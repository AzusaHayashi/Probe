import { WorldManager } from './worldManager.js';
import { setupControls } from './controls.js';
import { state } from './gameState.js';
import { render } from './renderer.js';
import { handleMove, handleExec } from './actions.js';
import { handleMenuInput, startNewExpedition } from './menuManager.js';

function init() {
    // 优先尝试从本地存储加载
    const hasSave = WorldManager.loadFromStorage(state);

    if (!hasSave) {
        startNewExpedition();
    }

    state.worldPos = { ...WorldManager.state.playerPos };
    state.overlay = 'TITLE';

    // 覆盖层（标题/帮助/结局）打开时：EXEC 关闭它，其他键忽略
    const closeOverlay = () => {
        if (state.overlay === 'WIN' || state.overlay === 'LOSE') {
            startNewExpedition();
        }
        state.overlay = null;
        render();
    };

    setupControls(
        (key) => {
            if (state.overlay) return;
            if (state.mode === 'MENU') {
                handleMenuInput(key);
                render();
            } else {
                handleMove(key);
            }
        },
        () => {
            if (state.overlay) { closeOverlay(); return; }
            if (state.mode === 'MENU') {
                handleMenuInput('exec');
                render();
            } else {
                handleExec();
            }
        }
    );

    document.getElementById('btn-help').addEventListener('click', () => {
        if (state.overlay === 'WIN' || state.overlay === 'LOSE') return;
        state.overlay = state.overlay ? null : 'HELP';
        render();
    });
    document.getElementById('overlay').addEventListener('click', () => {
        if (state.overlay === 'TITLE' || state.overlay === 'HELP') closeOverlay();
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