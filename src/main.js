import { CONFIG } from './constants.js';
import { WorldManager } from './worldManager.js';
import { setupControls } from './controls.js';

let state = {
    mode: 'WORLD', 
    worldPos: { x: 5, y: 5 },
    // 地牢状态
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: 'd' },
    // 撤离二次确认状态
    evacConfirm: false,
    // 统计
    time: 0,
    resources: 0
};

function init() {
    WorldManager.init(12345);
    state.worldPos = { ...WorldManager.state.playerPos };
    
    // 核心逻辑：将处理函数传给控制模块
    setupControls(handleMove, handleExec);
    
    render();
}

// --- 核心控制分发 ---

function handleMove(key) {
    if (state.mode === 'WORLD') {
        moveInWorld(key);
    } else {
        moveInInstance(key);
        // 核心要求：如果移动了，重置撤离确认状态
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
            WorldManager.saveToStorage();
            log.innerText = "PROGRESS SAVED.";
        }
    } else {
        // 地牢内执行逻辑
        const isAtStart = (state.probe.x === state.pathStack[0].x && state.probe.y === state.pathStack[0].y);
        
        if (isAtStart) {
            if (!state.evacConfirm) {
                state.evacConfirm = true;
                log.innerText = "CONFIRM EVACUATION? (Press EXEC again to leave)";
            } else {
                exitInstance();
            }
        } else {
            executeAction(); // 捡东西或开门
        }
    }
    render();
}

// --- 内部逻辑模块 ---

function moveInWorld(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    let [dx, dy] = moves[key];
    let nx = state.worldPos.x + dx, ny = state.worldPos.y + dy;

    if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
        state.worldPos.x = nx;
        state.worldPos.y = ny;
        state.time += 10;
        WorldManager.state.playerPos = { x: nx, y: ny };
    }
}

function moveInInstance(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    let [dx, dy] = moves[key];
    let last = state.pathStack.length > 1 ? state.pathStack[state.pathStack.length-2] : null;

    if(last && (state.probe.x + dx === last.x && state.probe.y + dy === last.y)) {
        let curr = state.pathStack.pop();
        if (state.map[curr.y][curr.x] !== 'H') state.map[curr.y][curr.x] = curr.c; 
        state.probe.x = last.x; state.probe.y = last.y;
        state.time += 1;
    } 
    else if(key !== state.probe.facing) {
        state.probe.facing = key;
    } 
    else {
        let nx = state.probe.x + dx, ny = state.probe.y + dy;
        if(nx >= 0 && nx < CONFIG.SIZE && ny >= 0 && ny < CONFIG.SIZE) {
            let target = state.map[ny][nx];
            if((target === '.' || target === 'O') && state.pathStack.length < CONFIG.MAX_TETHER) {
                state.map[state.probe.y][state.probe.x] = (dx !== 0) ? '-' : '|';
                if(state.pathStack.length === 1) state.map[state.probe.y][state.probe.x] = 'H';
                state.probe.x = nx; state.probe.y = ny;
                state.pathStack.push({x: nx, y: ny, c: target});
                state.time += 1;
            }
        }
    }
}

function executeAction() {
    let acted = false;
    let head = state.pathStack[state.pathStack.length-1];
    
    // 捡资源
    if(head.c === 'O') {
        state.resources++; head.c = '.'; state.map[state.probe.y][state.probe.x] = '.';
        state.time += 2; acted = true;
    }
    
    // 开门
    if(!acted) {
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(d => {
            let tx = state.probe.x + d[0], ty = state.probe.y + d[1];
            if(state.map[ty] && state.map[ty][tx] === '+') {
                state.map[ty][tx] = '.';
                state.time += 5; 
                document.getElementById('log').innerText = "DOOR BYPASSED (+5 min)";
                acted = true;
            }
        });
    }
}

// --- 状态切换 ---

function enterInstance() {
    const res = WorldManager.enterInstance(state.worldPos.x, state.worldPos.y);
    if (res) {
        state.mode = 'INSTANCE';
        state.map = res.map;
        state.probe.x = res.startRoom.cx;
        state.probe.y = res.startRoom.cy;
        state.pathStack = [{x: state.probe.x, y: state.probe.y, c: 'H'}];
        state.map[state.probe.y][state.probe.x] = 'H';
        document.getElementById('log').innerText = "SYSTEM CONNECTED. START SCANNING.";
    }
}

function exitInstance() {
    WorldManager.updateInstanceState(state.worldPos.x, state.worldPos.y, state.map);
    state.mode = 'WORLD';
    state.evacConfirm = false;
    document.getElementById('log').innerText = "EVACUATION COMPLETE.";
}

// --- 渲染逻辑 ---

function render() {
    if (state.mode === 'WORLD') renderWorld();
    else renderInstance();
    
    document.getElementById('val-time').innerText = state.time;
    document.getElementById('val-res').innerText = state.resources;
}

function renderWorld() {
    let html = "";
    const worldMap = WorldManager.state.overworld;
    for(let y=0; y<worldMap.length; y++) {
        html += "<div>";
        for(let x=0; x<worldMap[y].length; x++) {
            let isPlayer = (x === state.worldPos.x && y === state.worldPos.y);
            let char = isPlayer ? '@' : worldMap[y][x];
            html += `<span class="${isPlayer ? 'obj-highlight' : 'dim'}">${char}</span>`;
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
            let isProbe = (x === state.probe.x && y === state.probe.y);
            let char = isProbe ? {w:'^',s:'v',a:'<',d:'>'}[state.probe.facing] : state.map[y][x];
            let isTether = (char==='|' || char==='-' || char==='H' || isProbe);
            let className = isTether ? "obj-highlight" : (isVisible(x, y) ? "lit" : "dim");
            html += `<span class="${className}">${char}</span>`;
        }
        html += "</div>";
    }
    document.getElementById('game-screen').innerHTML = html;
    document.getElementById('val-len').innerText = state.pathStack.length - 1;
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

init();