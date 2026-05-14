import { WorldManager } from './worldManager.js';
import { setupControls } from './controls.js';
import { state } from './gameState.js';
import { render } from './renderer.js';
import { handleMove, handleExec } from './actions.js';

function init() {
    localStorage.removeItem('scavenge_world_data');
    const randomSeed = Math.floor(Math.random() * 999999);
    WorldManager.init(randomSeed);

    state.worldPos = { ...WorldManager.state.playerPos };
    setupControls(handleMove, handleExec);

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
                WorldManager.loadFromStorage();
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