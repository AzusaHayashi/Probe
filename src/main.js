import { CONFIG } from './constants.js';
import { WorldManager } from './worldManager.js';
import { setupControls } from './controls.js';

let state = {
    mode: 'WORLD',
    worldPos: { x: 5, y: 5 },
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: 'd' },
    evacConfirm: false,
    time: 0,
    resources: 0,
    saveConfirm: false
};

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

// --- 核心控制 ---

function handleMove(key) {
    if (state.mode === 'WORLD') {
        moveInWorld(key);
    } else {
        moveInInstance(key);
        state.evacConfirm = false; 
    }
    render();
}

function handleExec() {
    const log = document.getElementById('log');
    if (state.mode === 'WORLD') {
        const tile = WorldManager.state.overworld[state.worldPos.y][state.worldPos.x];
        if (['F', 'S', 'M'].includes(tile)) {
            enterInstance();
        } else if (tile === 'E') {
            if (!state.saveConfirm) {
                state.saveConfirm = true;
                log.style.color = "#ffff00";
                log.innerText = "CONFIRM SAVE? (Press EXEC again to SAVE, or move to cancel)";
            } else {
                WorldManager.saveToStorage();
                log.style.color = "#55ff55";
                log.innerText = "DATABASE SAVED TO LOCAL STORAGE.";
                state.saveConfirm = false;
            }
        } else if (tile === 'I') {
            if (!state.saveConfirm) {
                state.saveConfirm = true;
                log.style.color = "#ffff00";
                log.innerText = "EXPORT: Press EXEC | IMPORT: Use file input below";
            } else {
                const saveData = localStorage.getItem('scavenge_world_data');
                if (saveData) {
                    const blob = new Blob([saveData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `probe_save_${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    log.style.color = "#55ff55";
                    log.innerText = "SAVE EXPORTED.";
                } else {
                    log.style.color = "#ff5555";
                    log.innerText = "NO SAVE DATA.";
                }
                state.saveConfirm = false;
            }
        }
    } else {
        // 撤离逻辑：检查是否在底座 'H' 上
        const isAtStart = (state.pathStack.length > 0 && state.probe.x === state.pathStack[0].x && state.probe.y === state.pathStack[0].y);
        if (isAtStart) {
            if (!state.evacConfirm) {
                state.evacConfirm = true;
                log.style.color = "#ffff00";
                log.innerText = "CONFIRM EVACUATION? (Press EXEC)";
            } else {
                exitInstance();
            }
        } else {
            executeAction(); 
        }
    }
    render();
}

// --- 逻辑模块 ---

function moveInInstance(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    if (!moves[key]) return;
    let [dx, dy] = moves[key];
    
    let last = state.pathStack.length > 1 ? state.pathStack[state.pathStack.length - 2] : null;

    // 回退逻辑
    if(last && (state.probe.x + dx === last.x && state.probe.y + dy === last.y)) {
        let curr = state.pathStack.pop();
        if (state.map[curr.y][curr.x] !== 'H') {
            state.map[curr.y][curr.x] = curr.c; 
        }
        state.probe.x = last.x; 
        state.probe.y = last.y;
    } 
    // 转向逻辑
    else if(key !== state.probe.facing) {
        state.probe.facing = key;
    } 
    // 前进逻辑
    else {
        let nx = state.probe.x + dx, ny = state.probe.y + dy;
        if(nx >= 0 && nx < CONFIG.SIZE && ny >= 0 && ny < CONFIG.SIZE) {
            let target = state.map[ny][nx];
            // 允许经过地板(.)和资源(O)，墙(#)和门(+)不能通过
            if((target === '.' || target === 'O') && state.pathStack.length < CONFIG.MAX_TETHER) {
                state.map[state.probe.y][state.probe.x] = (dx !== 0) ? '-' : '|';
                if(state.pathStack.length === 1) state.map[state.probe.y][state.probe.x] = 'H';
                
                state.probe.x = nx; 
                state.probe.y = ny;
                state.pathStack.push({x: nx, y: ny, c: target});
                state.time += 1;
            }
        }
    }
}

/**
 * 修复开门和资源获取逻辑
 */
function executeAction() {
    let acted = false;
    const log = document.getElementById('log');
    let head = state.pathStack[state.pathStack.length - 1];

    // 1. 获取当前格资源
    if(head.c === 'O') {
        state.resources++; 
        head.c = '.'; // 更新路径栈记录
        state.map[state.probe.y][state.probe.x] = '.'; // 更新当前显示
        log.innerText = "RESOURCE SECURED (+1)";
        acted = true;
    }
    
    // 2. 尝试破解相邻的门 (+)
    if(!acted) {
        const adj = [[0,1],[0,-1],[1,0],[-1,0]];
        for(let [ax, ay] of adj) {
            let tx = state.probe.x + ax, ty = state.probe.y + ay;
            if(state.map[ty] && state.map[ty][tx] === '+') {
                state.map[ty][tx] = '.'; // 门变地板
                log.innerText = "DOOR BYPASSED.";
                acted = true;
                break;
            }
        }
    }
    
    if(!acted) log.innerText = "NO INTERACTABLE OBJECTS.";
}

// --- 状态切换 ---

function enterInstance() {
    const res = WorldManager.enterInstance(state.worldPos.x, state.worldPos.y);
    state.mode = 'INSTANCE';
    state.map = res.map;

    let startX, startY;
    // 统一处理：优先找地图上的 H，找不到再用 startRoom
    let foundH = false;
    for(let y=0; y<state.map.length; y++) {
        for(let x=0; x<state.map[y].length; x++) {
            if(state.map[y][x] === 'H') { startX = x; startY = y; foundH = true; break; }
        }
        if(foundH) break;
    }

    if(!foundH && res.startRoom) {
        startX = res.startRoom.cx;
        startY = res.startRoom.cy;
    }

    state.probe = { x: startX, y: startY, facing: 'd' };
    state.pathStack = [{x: startX, y: startY, c: 'H'}];
    state.map[startY][startX] = 'H';
    
    document.getElementById('log').innerText = "PROBE LINK ESTABLISHED.";
}

function exitInstance() {
    WorldManager.updateInstanceState(state.worldPos.x, state.worldPos.y, state.map);
    state.mode = 'WORLD';
    state.evacConfirm = false;
    state.saveConfirm = false;
}

// --- 渲染 (保持不变) ---
function render() {
    if (state.mode === 'WORLD') renderWorld(); else renderInstance();
    document.getElementById('val-time').innerText = state.time;
    document.getElementById('val-res').innerText = state.resources;
}

function renderWorld() {
    let html = "";
    const worldMap = WorldManager.state.overworld;
    for(let y=0; y<worldMap.length; y++) {
        html += "<div>";
        for(let x=0; x<worldMap[y].length; x++) {
            let isP = (x === state.worldPos.x && y === state.worldPos.y);
            html += `<span class="${isP ? 'obj-highlight' : 'dim'}">${isP ? '@' : worldMap[y][x]}</span>`;
        }
        html += "</div>";
    }
    document.getElementById('game-screen').innerHTML = html;
}

function renderInstance() {
    let html = "";
    for(let y=0; y<CONFIG.SIZE; y++) {
        html += "<div>";
        for(let x=0; x<CONFIG.SIZE; x++) {
            let isP = (x === state.probe.x && y === state.probe.y);
            let char = isP ? {w:'^',s:'v',a:'<',d:'>'}[state.probe.facing] : state.map[y][x];
            let isT = (char==='|' || char==='-' || char==='H' || isP);
            html += `<span class="${isT ? 'obj-highlight' : (isVisible(x,y)?'lit':'dim')}">${char}</span>`;
        }
        html += "</div>";
    }
    document.getElementById('game-screen').innerHTML = html;
    document.getElementById('val-len').innerText = (CONFIG.MAX_TETHER - state.pathStack.length + 1);
}

function isVisible(x, y) {
    let dist = Math.sqrt((x-state.probe.x)**2 + (y-state.probe.y)**2);
    if(dist > CONFIG.VIEW_DIST) return false;
    let angle = Math.atan2(y - state.probe.y, x - state.probe.x) * 180 / Math.PI;
    let fA = {'w':-90, 's':90, 'a':180, 'd':0}[state.probe.facing];
    let diff = Math.abs(angle - fA);
    if(diff > 180) diff = 360 - diff;
    return diff <= CONFIG.CONE_ANGLE;
}

function moveInWorld(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    let [dx, dy] = moves[key] || [0,0];
    let nx = state.worldPos.x + dx, ny = state.worldPos.y + dy;
    if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
        state.worldPos.x = nx; state.worldPos.y = ny;
        WorldManager.state.playerPos = { x: nx, y: ny };
        state.saveConfirm = false;
    }
}

init();