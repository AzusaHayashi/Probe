import { WorldManager } from './worldManager.js';
import { state, advanceTime, checkCargoCollection, checkCargoDecay, updateInstanceCargoVisibility } from './gameState.js';
import { render } from './renderer.js';

/**
 * 处理移动指令
 */
export function handleMove(key) {
    if (state.mode === 'WORLD') {
        moveInWorld(key);
    } else {
        moveInInstance(key);
        state.evacConfirm = false; 
    }
    render();
}

/**
 * 处理执行指令 (EXEC)
 */
export function handleExec() {
    const log = document.getElementById('log');
    if (!log) return;

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

/**
 * 在地牢实例内移动
 */
export function moveInInstance(key) {
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
 * 执行地牢内交互动作
 */
export function executeAction() {
    let acted = false;
    const log = document.getElementById('log');
    if (!log) return;
    
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

/**
 * 进入地牢实例
 */
export function enterInstance() {
    const res = WorldManager.enterInstance(state.worldPos.x, state.worldPos.y);
    if (!res) return;
    
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

    const log = document.getElementById('log');
    if (log) log.innerText = "PROBE LINK ESTABLISHED.";
}

/**
 * 退出地牢实例
 */
export function exitInstance() {
    WorldManager.updateInstanceState(state.worldPos.x, state.worldPos.y, state.map);
    state.mode = 'WORLD';
    state.evacConfirm = false;
    state.saveConfirm = false;
    state.movingCargo = [];
}

/**
 * 在大世界移动
 */
export function moveInWorld(key) {
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
