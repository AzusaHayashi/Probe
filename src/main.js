import { CONFIG } from './constants.js';
import { WorldManager } from './worldManager.js';

let state = {
    mode: 'WORLD', // 'WORLD' (大世界) 或 'INSTANCE' (地牢内)
    worldPos: { x: 5, y: 5 }, // 玩家在大世界的坐标
    // 地牢内状态
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: 'd' },
    // 统计数据
    time: 0,
    resources: 0
};

function init() {
    // 1. 初始化世界管理器（使用一个固定种子或随机种子）
    WorldManager.init(12345);
    
    // 2. 从 WorldManager 加载玩家初始位置
    state.worldPos = { ...WorldManager.state.playerPos };
    
    bindControls();
    render();
}

// --- 渲染逻辑 ---

function render() {
    if (state.mode === 'WORLD') {
        renderWorld();
    } else {
        renderInstance();
    }
    
    // 更新通用 UI
    document.getElementById('val-time').innerText = state.time;
    document.getElementById('val-res').innerText = state.resources;
}

// 渲染大世界
function renderWorld() {
    let html = "";
    const worldMap = WorldManager.state.overworld;
    const size = worldMap.length;

    for(let y=0; y<size; y++) {
        html += "<div>";
        for(let x=0; x<size; x++) {
            let char = (x === state.worldPos.x && y === state.worldPos.y) ? '@' : worldMap[y][x];
            let className = (x === state.worldPos.x && y === state.worldPos.y) ? "obj-highlight" : "dim";
            html += `<span class="${className}">${char}</span>`;
        }
        html += "</div>";
    }
    document.getElementById('game-screen').innerHTML = html;
    document.getElementById('log').innerText = "WORLD MAP: Move to [F/S/M] to Scavenge, [E] to Save.";
}

// 渲染地牢（保持你原有的逻辑，但增加一个撤离点判定）
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

// --- 控制系统 ---

function handleMove(key) {
    if (state.mode === 'WORLD') {
        moveInWorld(key);
    } else {
        moveInInstance(key);
    }
    render();
}

// 大世界移动
function moveInWorld(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    let [dx, dy] = moves[key];
    let nx = state.worldPos.x + dx, ny = state.worldPos.y + dy;

    if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
        state.worldPos.x = nx;
        state.worldPos.y = ny;
        state.time += 10; // 大世界移动耗时更多
        WorldManager.state.playerPos = { x: nx, y: ny };
    }
}

// 地牢内移动（你原有的逻辑，稍作修改）
function moveInInstance(key) {
    const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
    let [dx, dy] = moves[key];
    let last = state.pathStack.length > 1 ? state.pathStack[state.pathStack.length-2] : null;

    // 后退逻辑
    if(last && (state.probe.x + dx === last.x && state.probe.y + dy === last.y)) {
        let curr = state.pathStack.pop();
        if (state.map[curr.y][curr.x] !== 'H') {
            state.map[curr.y][curr.x] = curr.c; 
        }
        state.probe.x = last.x; state.probe.y = last.y;
        state.time += 1;

        // --- 核心：回到起点 'H' 自动撤离 ---
        if (state.pathStack.length === 1) {
            exitInstance();
        }
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

// --- 交互逻辑 (空格/Enter) ---

function handleExec() {
    if (state.mode === 'WORLD') {
        const tile = WorldManager.state.overworld[state.worldPos.y][state.worldPos.x];
        if (['F', 'S', 'M'].includes(tile)) {
            enterInstance();
        } else if (tile === 'E') {
            WorldManager.saveToStorage();
            document.getElementById('log').innerText = "PROGRESS SAVED AT EXTRACTION POINT.";
        }
    } else {
        // 原有的地牢交互逻辑
        executeInInstance();
    }
    render();
}

function enterInstance() {
    const res = WorldManager.enterInstance(state.worldPos.x, state.worldPos.y);
    if (res) {
        state.mode = 'INSTANCE';
        state.map = res.map;
        state.probe.x = res.startRoom.cx;
        state.probe.y = res.startRoom.cy;
        state.probe.facing = 'd';
        state.map[state.probe.y][state.probe.x] = 'H';
        state.pathStack = [{x: state.probe.x, y: state.probe.y, c: 'H'}];
        document.getElementById('log').innerText = "ENTERING SITE...";
    }
}

function exitInstance() {
    // 退出前，向 WorldManager 同步当前地图状态（实现“彻底固定”）
    WorldManager.updateInstanceState(state.worldPos.x, state.worldPos.y, state.map);
    state.mode = 'WORLD';
    document.getElementById('log').innerText = "RETURNED TO OVERWORLD.";
}

function executeInInstance() {
    let head = state.pathStack[state.pathStack.length-1];
    if(head.c === 'O') {
        state.resources++; 
        head.c = '.'; 
        state.map[state.probe.y][state.probe.x] = '.';
        state.time += 2;
    }
    // 开门逻辑... (保持原样)
}

// 绑定与初始化...
function bindControls() {
    window.addEventListener('keydown', e => {
        let k = e.key.toLowerCase();
        if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
            e.preventDefault();
            let key = k.startsWith('arrow') ? {arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'}[k] : k;
            handleMove(key);
        }
        if(k === ' ' || k === 'enter') { e.preventDefault(); handleExec(); }
    });
}

init();