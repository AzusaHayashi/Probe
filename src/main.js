import { CONFIG } from './constants.js';
import { WorldManager } from './worldManager.js';
import { setupControls } from './controls.js';
import { isVisible } from './visibility.js';

let state = {
    mode: 'WORLD',
    worldPos: { x: 5, y: 5 },
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: 'd' },
    evacConfirm: false,
    time: 0,
    resources: 0,
    saveConfirm: false,
    movingCargo: [],
    upgradeConfirm: false,
    speedConfirm: false,
    tetherMax: 35,
    transportSpeed: 1,
    currentInstanceKey: null,
    lastDecayCheck: 0
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
        if (['F', 'S', 'M', 'W'].includes(tile)) {
            enterInstance();
        } else if (tile === 'E') {
            if (!state.saveConfirm) {
                state.saveConfirm = true;
                log.style.color = "#ffff00";
                log.innerText = "CONFIRM SAVE? (Press EXEC again to SAVE, or move to cancel)";
            } else {
                WorldManager.saveToStorage();
                const key = `${state.worldPos.x},${state.worldPos.y}`;
                if (WorldManager.state.instances[key]) WorldManager.state.instances[key].visited = true;
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
                    const key = `${state.worldPos.x},${state.worldPos.y}`;
                    if (WorldManager.state.instances[key]) WorldManager.state.instances[key].visited = true;
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

/**
 * 推进时间并处理相关逻辑（如资源包移动）
 */
function advanceTime(amount) {
    state.time += amount;

    // 只有在探索模式下，时间增加才会推动资源包移动
    if (state.mode === 'INSTANCE' && state.movingCargo.length > 0) {
        // 时间增加 amount，资源包移动 amount * transportSpeed
        const moveDist = amount * state.transportSpeed;
        state.movingCargo.forEach(cargo => {
            cargo.pathIndex -= moveDist;
        });
        checkCargoCollection(); // 检查是否到达回收点
        checkCargoDecay();      // 检查资源包衰减
        updateInstanceCargoVisibility(); // 更新可见状态
    }
}

function moveInInstance(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    if (!moves[key]) return;
    let [dx, dy] = moves[key];
    
    let last = state.pathStack.length > 1 ? state.pathStack[state.pathStack.length - 2] : null;

    // 回退逻辑
    if(last && (state.probe.x + dx === last.x && state.probe.y + dy === last.y)) {
        let removedIndex = state.pathStack.length - 1;
        let curr = state.pathStack.pop();
        if (state.map[curr.y][curr.x] !== 'H') {
            state.map[curr.y][curr.x] = curr.c; 
        }

        // 资源包随探头回退
        state.movingCargo.forEach(cargo => {
            if (cargo.pathIndex === removedIndex) {
                cargo.pathIndex = state.pathStack.length - 1;
            }
        });
        checkCargoCollection(); // 回退后立即检查回收
        checkCargoDecay(); // 检查资源包衰减
        updateInstanceCargoVisibility(); // 更新资源包可见状态
        render(); // 即时更新管道和资源包位置

        state.probe.x = last.x; 
        state.probe.y = last.y;
    } 
    // 转向逻辑
    else if(key !== state.probe.facing) {
        state.probe.facing = key;
        updateInstanceCargoVisibility(); // 转向也会改变视野
        render();
    } 
    // 前进逻辑
    else {
        let nx = state.probe.x + dx, ny = state.probe.y + dy;
        const currentMapSize = state.map.length;
        if(nx >= 0 && nx < currentMapSize && ny >= 0 && ny < currentMapSize) {
            let target = state.map[ny][nx];
            // 允许经过地板(.)和资源(O)，墙(#)和门(+)不能通过
            if((target === '.' || target === 'O' || target === 'T' || target === 'S') && state.pathStack.length < state.tetherMax) {
                state.map[state.probe.y][state.probe.x] = (dx !== 0) ? '-' : '|';
                if(state.pathStack.length === 1) state.map[state.probe.y][state.probe.x] = 'H';
                
                state.probe.x = nx; 
                state.probe.y = ny;
                state.pathStack.push({x: nx, y: ny, c: target});
                advanceTime(1);
                state.upgradeConfirm = false; // 移动时重置确认状态
                state.speedConfirm = false;
                render(); // 即时更新管道和资源包位置
            }
        }
    }
}

/**
 * 检查并回收已到达本体的资源包
 */
function checkCargoCollection() {
    const initialCount = state.movingCargo.length;
    state.movingCargo = state.movingCargo.filter(cargo => {
        if (cargo.pathIndex <= 0) {
            state.resources += 1;
            return false;
        }
        return true;
    });

    if (state.movingCargo.length < initialCount) {
        const log = document.getElementById('log');
        log.style.color = "#55ff55";
        log.innerText = "CARGO SECURED (+1)";
    }
}

/**
 * 每200time检测一次视野内未被拾取的资源包，有1/20概率消失
 */
function checkCargoDecay() {
    if (!state.currentInstanceKey) return;

    const loc = WorldManager.state.instances[state.currentInstanceKey];
    if (!loc || !loc.cargoSeen) return;

    // 每200time检测一次
    if (state.time > 0 && state.time % 200 === 0 && state.time !== state.lastDecayCheck) {
        state.lastDecayCheck = state.time;

        // 检测所有未被拾取的资源包
        for (let y = 0; y < state.map.length; y++) {
            for (let x = 0; x < state.map[y].length; x++) {
                if (state.map[y][x] === 'O') {
                    let key = `${x},${y}`;
                    if (loc.cargoSeen.has(key) && !loc.cargoGone?.has(key)) {
                        if (Math.random() < 1/20) {
                            if (!loc.cargoGone) loc.cargoGone = new Set();
                            loc.cargoGone.add(key);
                            state.map[y][x] = '.';
                        }
                    }
                }
            }
        }
    }
}

/**
 * 更新当前视野内资源包的可见状态
 */
function updateInstanceCargoVisibility() {
    if (!state.currentInstanceKey) return;

    const loc = WorldManager.state.instances[state.currentInstanceKey];
    if (!loc) return;

    if (!loc.revealedPoints) loc.revealedPoints = new Set();

    const px = state.probe.x;
    const py = state.probe.y;
    
    // 遍历地图，根据 isVisible 逻辑更新揭示点
    for (let y = 0; y < state.map.length; y++) {
        for (let x = 0; x < state.map[y].length; x++) {
            if (isVisible(x, y, state.probe, state.map)) {
                const key = `${x},${y}`;
                loc.revealedPoints.add(key);

                if (state.map[y][x] === 'O') {
                    loc.cargoSeen.add(key);
                    // 如果之前标记为消失，重新出现
                    if (loc.cargoGone?.has(key)) {
                        loc.cargoGone.delete(key);
                        state.map[y][x] = 'O';
                    }
                }
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
        state.movingCargo.push({ pathIndex: state.pathStack.length - 1 });
        head.c = '.'; // 更新路径栈记录，防止重复拾取
        log.innerText = "RESOURCE LOADED. TRANSPORTING...";
        checkCargoCollection(); // 立即检查是否可回收
        acted = true;
    }

    // 1.5 升级逻辑 (T)
    if(!acted && head.c === 'T') {
        if (state.resources >= 5) {
            if (!state.upgradeConfirm) {
                state.upgradeConfirm = true;
                log.style.color = "#ffff00";
                log.innerText = "UPGRADE TETHER? (Cost: 5 Cargo, +15 Time). Press EXEC.";
            } else {
                state.resources -= 5;
                state.tetherMax += 1;
                advanceTime(15);
                state.upgradeConfirm = false;
                log.style.color = "#55ff55";
                log.innerText = "TETHER CAPACITY UPGRADED! (+1)";
            }
        } else {
            log.style.color = "#ff5555";
            log.innerText = "INSUFFICIENT CARGO. (Need 5)";
        }
        acted = true;
    }

    // 1.6 速度升级逻辑 (S)
    if(!acted && head.c === 'S') {
        if (state.resources >= 2) {
            if (!state.speedConfirm) {
                state.speedConfirm = true;
                log.style.color = "#ffff00";
                log.innerText = "UPGRADE SPEED? (Cost: 2 Cargo). Press EXEC.";
            } else {
                state.resources -= 2;
                state.transportSpeed += 1;
                state.speedConfirm = false;
                log.style.color = "#55ff55";
                log.innerText = "TRANSPORT SPEED UPGRADED! (+1)";
            }
        } else {
            log.style.color = "#ff5555";
            log.innerText = "INSUFFICIENT CARGO. (Need 2)";
        }
        acted = true;
    }
    
    // 2. 尝试破解相邻的门 (+)
    if(!acted) {
        const adj = [[0,1],[0,-1],[1,0],[-1,0]];
        for(let [ax, ay] of adj) {
            let tx = state.probe.x + ax, ty = state.probe.y + ay;
            if(state.map[ty] && state.map[ty][tx] === '+') {
                state.map[ty][tx] = '.'; // 门变地板
                const cost = Math.floor(Math.random() * 3) + 3; // 3 to 5
                advanceTime(cost);
                log.innerText = `DOOR BYPASSED. (+${cost} TIME)`;
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
    state.currentInstanceKey = res.instanceKey;
    state.lastDecayCheck = 0;

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
    state.movingCargo = [];
    state.map[startY][startX] = 'H';

    document.getElementById('log').innerText = "PROBE LINK ESTABLISHED.";
}

function exitInstance() {
    WorldManager.updateInstanceState(state.worldPos.x, state.worldPos.y, state.map);
    state.mode = 'WORLD';
    state.evacConfirm = false;
    state.saveConfirm = false;
    state.movingCargo = [];
}

// --- 渲染 (保持不变) ---
function render() {
    if (state.mode === 'WORLD') renderWorld(); else renderInstance();
    document.getElementById('val-time').innerText = state.time;
    document.getElementById('val-res').innerText = state.resources;
    document.getElementById('val-max-len').innerText = state.tetherMax;
}

function renderWorld() {
    let html = "";
    const worldMap = WorldManager.state.overworld;
    const px = state.worldPos.x;
    const py = state.worldPos.y;
    const viewRadius = 5;

    for(let y=0; y<worldMap.length; y++) {
        html += "<div>";
        for(let x=0; x<worldMap[y].length; x++) {
            let isP = (x === px && y === py);
            let dx = x - px, dy = y - py;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let inSight = dist <= viewRadius;
            let key = `${x},${y}`;
            let revealed = WorldManager.state.revealedTiles[key];

            let char, className;

            if (isP) {
                char = '@';
                className = 'obj-highlight';
            } else if (inSight) {
                char = worldMap[y][x];
                if (char !== '.') {
                    const loc = WorldManager.state.instances[key];
                    let isVisited = loc && loc.visited;
                    if (revealed) {
                        revealed.visible = true;
                    } else {
                        WorldManager.state.revealedTiles[key] = { tile: char, visible: true };
                    }
                    WorldManager.state.explored.add(key);
                    className = isVisited ? 'explored-highlight' : 'lit';
                } else {
                    char = '.';
                    className = 'lit';
                }
            } else {
                if (revealed && revealed.visible) {
                    char = revealed.tile;
                    className = 'dim';
                } else {
                    char = '.';
                    className = 'fog';
                }
            }

            html += `<span class="${className}">${char}</span>`;
        }
        html += "</div>";
    }
    document.getElementById('game-screen').innerHTML = html;
}

function renderInstance() {
    let html = "";
    // 创建一个坐标映射，方便查找该格子上是否有正在移动的资源包
    const cargoMap = new Set();
    state.movingCargo.forEach(c => {
        const pos = state.pathStack[c.pathIndex];
        if (pos) cargoMap.add(`${pos.x},${pos.y}`);
    });

    const currentMapSize = state.map.length; // 使用实际地图大小
    const loc = WorldManager.state.instances[state.currentInstanceKey];

    for(let y=0; y<currentMapSize; y++) {
        html += "<div>";
        for(let x=0; x<currentMapSize; x++) {
            const key = `${x},${y}`;
            const isP = (x === state.probe.x && y === state.probe.y);
            const isCargo = cargoMap.has(key);
            const inSight = isVisible(x, y, state.probe, state.map);
            const hasBeenSeen = loc && loc.revealedPoints && loc.revealedPoints.has(key);
            
            let char = state.map[y][x];
            const isPipeline = (char === '|' || char === '-' || char === 'H');

            // 探头位置显示
            if (isP) char = {w:'^',s:'v',a:'<',d:'>'}[state.probe.facing];
            // 管道中的资源包显示
            else if (isCargo) char = 'O';

            // 战争迷雾逻辑
            let className = 'fog';
            if (inSight || isP || isCargo) {
                // 当前视野内、探头位置、管道资源包：高亮
                className = 'obj-highlight';
            } else if (isPipeline) {
                // 管道线始终高亮显示，不受视野影响
                className = 'obj-highlight';
            } else if (hasBeenSeen) {
                // 曾经看到过的地方：暗色显示，但如果是资源包或门，隐藏它们直到再次被看到
                className = 'dim';
                if (char === 'O' || char === '+') char = '.'; 
            } else {
                // 完全没看过的地方：显示为空地或迷雾
                char = ' ';
                className = 'fog';
            }

            html += `<span class="${className}">${char}</span>`;
        }
        html += "</div>";
    }
    document.getElementById('game-screen').innerHTML = html;
    document.getElementById('val-len').innerText = (state.tetherMax - state.pathStack.length + 1);
}

function moveInWorld(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    let [dx, dy] = moves[key] || [0,0];
    let nx = state.worldPos.x + dx, ny = state.worldPos.y + dy;
    if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
        state.worldPos.x = nx; state.worldPos.y = ny;
        WorldManager.state.playerPos = { x: nx, y: ny };
        advanceTime(5); // 世界上移动消耗 5 分钟
        state.saveConfirm = false;
    }
}

init();