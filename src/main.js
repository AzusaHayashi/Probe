import { CONFIG } from './constants.js';
import { generateDungeon } from './mapGen.js';

let state = {
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: 'd' },
    time: 0,
    resources: 0
};

function init() {
    const { map, startRoom } = generateDungeon();
    state.map = map;
    state.probe.x = startRoom.cx;
    state.probe.y = startRoom.cy;
    state.map[state.probe.y][state.probe.x] = 'H';
    state.pathStack.push({x: state.probe.x, y: state.probe.y, c: 'H'});
    
    bindControls();
    render();
}

// 渲染逻辑
function isVisible(x, y) {
    let dist = Math.sqrt((x-state.probe.x)**2 + (y-state.probe.y)**2);
    if(dist > CONFIG.VIEW_DIST) return false;
    let angle = Math.atan2(y - state.probe.y, x - state.probe.x) * 180 / Math.PI;
    let fA = {'w':-90, 's':90, 'a':180, 'd':0}[state.probe.facing];
    let diff = Math.abs(angle - fA);
    if(diff > 180) diff = 360 - diff;
    return diff <= CONFIG.CONE_ANGLE;
}

function render() {
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
    document.getElementById('val-time').innerText = state.time;
    document.getElementById('val-len').innerText = state.pathStack.length - 1;
    document.getElementById('val-res').innerText = state.resources;
}

// 控制系统
function bindControls() {
    const handleMove = (key) => {
        const moves = {'w':[0,-1],'s':[0,1],'a':[-1,0],'d':[1,0]};
        if(!moves[key]) return;
        let [dx, dy] = moves[key];
        let last = state.pathStack.length > 1 ? state.pathStack[state.pathStack.length-2] : null;

        // --- 核心修复：完美的后退逻辑 ---
        if(last && (state.probe.x + dx === last.x && state.probe.y + dy === last.y)) {
            let curr = state.pathStack.pop();
            
            // 只要不是本体，就还原格子状态（解决资源包残留和管道残留）
            if (state.map[curr.y][curr.x] !== 'H') {
                state.map[curr.y][curr.x] = curr.c; 
            }

            state.probe.x = last.x; 
            state.probe.y = last.y;
            state.time += 1;
        } 
        // --- 转向逻辑 ---
        else if(key !== state.probe.facing) {
            state.probe.facing = key;
        } 
        // --- 前进逻辑 ---
        else {
            let nx = state.probe.x + dx, ny = state.probe.y + dy;
            if(nx >= 0 && nx < CONFIG.SIZE && ny >= 0 && ny < CONFIG.SIZE) {
                let target = state.map[ny][nx];
                // 只有空地和资源包可以进入
                if((target === '.' || target === 'O') && state.pathStack.length < CONFIG.MAX_TETHER) {
                    // 留下管道符
                    state.map[state.probe.y][state.probe.x] = (dx !== 0) ? '-' : '|';
                    // 起点特殊处理
                    if(state.pathStack.length === 1) state.map[state.probe.y][state.probe.x] = 'H';
                    
                    state.probe.x = nx; state.probe.y = ny;
                    state.pathStack.push({x: nx, y: ny, c: target});
                    state.time += 1;
                } else if(target === '+') {
                    document.getElementById('log').innerText = "DOOR IS LOCKED.";
                }
            }
        }
        render();
    };

    const handleExec = () => {
        let acted = false;
        let head = state.pathStack[state.pathStack.length-1];
        if(head.c === 'O') {
            state.resources++; head.c = '.'; state.map[state.probe.y][state.probe.x] = '.';
            state.time += 2; acted = true;
        }
        if(!acted) {
            [[0,1],[0,-1],[1,0],[-1,0]].forEach(d => {
                let tx = state.probe.x + d[0], ty = state.probe.y + d[1];
                if(state.map[ty] && state.map[ty][tx] === '+') {
                    state.map[ty][tx] = '.';
                    const doorCost = Math.floor(Math.random() * 3) + 3; // 3, 4, 或 5
                    state.time += doorCost; 
                    
                    document.getElementById('log').innerText = `DOOR BYPASSED (+${doorCost} min)`;
                    acted = true;
                }
            });
        }
        render();
    };

    // 键盘监听
    window.addEventListener('keydown', e => {
        let k = e.key.toLowerCase();
        if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
            e.preventDefault();
            let key = k.startsWith('arrow') ? {arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'}[k] : k;
            handleMove(key);
        }
        if(k === ' ' || k === 'enter') { e.preventDefault(); handleExec(); }
    });

    // 按钮监听
    document.getElementById('btn-up').onpointerdown = () => handleMove('w');
    document.getElementById('btn-down').onpointerdown = () => handleMove('s');
    document.getElementById('btn-left').onpointerdown = () => handleMove('a');
    document.getElementById('btn-right').onpointerdown = () => handleMove('d');
    document.getElementById('btn-exec').onpointerdown = () => handleExec();
}

init();