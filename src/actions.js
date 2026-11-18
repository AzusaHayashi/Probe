import { WorldManager } from './worldManager.js';
import { state, advanceTime, checkCargoCollection, updateInstanceCargoVisibility, loseActiveDrone } from './gameState.js';
import { generateDungeon } from './mapGen.js';
import { initializeThreats, scanForMotion, ventAirlock } from './threats.js';
import { playSound } from './audio.js';
import { render } from './renderer.js';
import { CONFIG, SITE_INFO } from './constants.js';
import { rules } from './meta.js';

const moves = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };

function message(text, color = '#55ff55') {
    const log = document.getElementById('log');
    if (log) { log.style.color = color; log.innerText = text; }
}

export function handleMove(key) {
    if (state.mode === 'WORLD') moveInWorld(key);
    else if (state.mode === 'INSTANCE') {
        moveInInstance(key);
        state.evacConfirm = false;
    }
    render();
}

export function handleExec() {
    playSound('select');
    if (state.mode === 'WORLD') {
        const tile = WorldManager.state.overworld[state.worldPos.y][state.worldPos.x];
        if (['F', 'S', 'M', 'W'].includes(tile)) {
            enterInstance();
        } else if (tile === 'E') {
            if (!state.saveConfirm) {
                state.saveConfirm = true;
                message('CONFIRM SAVE? (Press EXEC again, or move to cancel)', '#ffff55');
            } else {
                const key = `${state.worldPos.x},${state.worldPos.y}`;
                if (WorldManager.state.instances[key]) WorldManager.state.instances[key].visited = true;
                WorldManager.saveToStorage(state);
                state.saveConfirm = false;
                message('DATABASE SAVED TO LOCAL STORAGE.');
            }
        } else if (tile === 'I') {
            state.mode = 'MENU';
            state.menu.currentIndex = 0;
            state.menu.confirming = false;
            message('DOCKING COMPLETE. COMMAND CENTER ACTIVE.');
        } else {
            message('NOTHING HERE. FIND A SITE (F/S/M/W), E OR I.');
        }
    } else if (state.mode === 'INSTANCE') {
        const home = state.pathStack[0];
        const isAtStart = home && state.probe.x === home.x && state.probe.y === home.y;
        // A facing door can still be operated from the base.
        if (isAtStart && !findDoor(true)) {
            if (!state.evacConfirm) {
                state.evacConfirm = true;
                message(state.movingCargo.length ? 'CARGO IN TRANSIT. EXEC = WAIT FOR IT & EVACUATE.' : 'CONFIRM EVACUATION? (Press EXEC)', '#ffff55');
            } else {
                let waited = 0;
                if (state.movingCargo.length) {
                    waited = Math.ceil(Math.max(...state.movingCargo.map(c => c.pathIndex)) / state.transportSpeed);
                    if (waited > 0 && advanceTime(waited)) { render(); return; }
                    state.movingCargo.forEach(c => { c.pathIndex = 0; });
                    checkCargoCollection();
                }
                if (state.overlay) { render(); return; }
                exitInstance();
                message(waited ? `EVACUATED. WAITED ${waited} MIN FOR CARGO. AUTO-SAVED.` : 'EVACUATED. AUTO-SAVED.');
            }
        } else {
            executeAction();
        }
    }
    render();
}

function terrainAt(point) {
    const loc = WorldManager.state.instances[state.currentInstanceKey];
    const key = `${point.x},${point.y}`;
    if (loc?.doors && Object.hasOwn(loc.doors, key)) return loc.doors[key] ? '.' : '+';
    return point.c;
}

export function moveInInstance(key) {
    if (!moves[key]) return;
    const [dx, dy] = moves[key];
    const last = state.pathStack.length > 1 ? state.pathStack[state.pathStack.length - 2] : null;
    if (last && state.probe.x + dx === last.x && state.probe.y + dy === last.y) {
        // A sealed door blocks the return trip as well as pursuing creatures.
        if (state.map[last.y]?.[last.x] === '+') {
            playSound('blocked');
            const turned = state.probe.facing !== key;
            state.probe.facing = key;
            updateInstanceCargoVisibility();
            if (!turned || !advanceTime(1)) message('DOOR SEALED. PRESS EXEC TO OPEN.', '#ffff55');
            return;
        }
        const loc = WorldManager.state.instances[state.currentInstanceKey];
        const lastKey = `${last.x},${last.y}`;
        if (state.probe.facing !== key && loc?.doors && Object.hasOwn(loc.doors, lastKey)) {
            // Facing the rear door first allows EXEC to seal it before retracting.
            state.probe.facing = key;
            updateInstanceCargoVisibility();
            playSound('turn');
            if (!advanceTime(1)) message('BULKHEAD IN SIGHT. EXEC TO SEAL OR MOVE TO RETRACT.');
            return;
        }
        const removedIndex = state.pathStack.length - 1;
        const curr = state.pathStack.pop();
        if (state.map[curr.y][curr.x] !== 'H') state.map[curr.y][curr.x] = terrainAt(curr);
        state.movingCargo.forEach(cargo => {
            if (cargo.pathIndex === removedIndex) cargo.pathIndex = state.pathStack.length - 1;
        });
        state.probe.x = last.x;
        state.probe.y = last.y;
        state.probe.facing = key;
        checkCargoCollection();
        updateInstanceCargoVisibility();
        playSound('move');
        advanceTime(1);
    } else if (key !== state.probe.facing) {
        state.probe.facing = key;
        updateInstanceCargoVisibility();
        playSound('turn');
        advanceTime(1);
    } else {
        const nx = state.probe.x + dx, ny = state.probe.y + dy;
        const target = state.map[ny]?.[nx];
        if (['.', 'O', 'T', 'S', 'A'].includes(target) && state.pathStack.length < state.tetherMax) {
            if (state.map[state.probe.y][state.probe.x] !== 'H') {
                state.map[state.probe.y][state.probe.x] = dx !== 0 ? '-' : '|';
            }
            state.probe.x = nx;
            state.probe.y = ny;
            state.pathStack.push({ x: nx, y: ny, c: target });
            state.upgradeConfirm = false;
            state.speedConfirm = false;
            playSound('move');
            advanceTime(1);
        } else {
            playSound('blocked');
            message(target === '+' ? 'DOOR SEALED. PRESS EXEC TO OPEN.' : 'PATH BLOCKED OR TETHER AT LIMIT.', '#ffff55');
        }
    }
}

// Restore the positions of doors opened by older versions of the game, when possible.
function prepareDoors(loc) {
    if (!loc.doors) {
        loc.doors = {};
        const source = loc.type !== 'W' && loc.seed != null
            ? generateDungeon(loc.seed, loc.type, rules.cargoBonus()).map : state.map;
        for (let y = 0; y < source.length; y++) {
            for (let x = 0; x < source[y].length; x++) {
                if (source[y][x] === '+' && state.map[y]?.[x] && state.map[y][x] !== '#') {
                    loc.doors[`${x},${y}`] = state.map[y][x] !== '+';
                }
            }
        }
    }
}

function findDoor(facingOnly = false) {
    const loc = WorldManager.state.instances[state.currentInstanceKey];
    if (!loc?.doors) return null;
    const forward = moves[state.probe.facing];
    const adjacent = facingOnly ? [forward] : [forward, ...Object.values(moves)];
    for (const [dx, dy] of adjacent) {
        const x = state.probe.x + dx, y = state.probe.y + dy;
        const key = `${x},${y}`;
        if (Object.hasOwn(loc.doors, key)) return { x, y, key, loc };
    }
    return null;
}

function toggleDoor(door) {
    const { x, y, key, loc } = door;
    const open = loc.doors[key];
    if (open && state.creatures.some(creature => creature.x === x && creature.y === y)) {
        playSound('blocked');
        message('DOOR OBSTRUCTED BY A CREATURE.', '#ff5555');
        return;
    }
    loc.doors[key] = !open;
    if (open) {
        // The tether passes through a sealed bulkhead; the drone cannot pass until reopened.
        state.map[y][x] = '+';
    } else {
        const index = state.pathStack.findIndex(point => point.x === x && point.y === y);
        if (index > 0 && index < state.pathStack.length - 1) {
            const previous = state.pathStack[index - 1];
            state.map[y][x] = previous.y === y ? '-' : '|';
        } else state.map[y][x] = '.';
    }
    playSound(open ? 'door-close' : 'door-open');
    const cost = open ? 1 : rules.doorCost(Math.random);
    if (!advanceTime(cost)) message(open ? 'BULKHEAD SEALED. (+1 TIME)' : `BULKHEAD OPEN. (+${cost} TIME)`);
}

export function executeAction() {
    const head = state.pathStack[state.pathStack.length - 1];
    if (!head) return;
    if (head.c === 'O') {
        state.movingCargo.push({ pathIndex: state.pathStack.length - 1 });
        head.c = '.';
        checkCargoCollection();
        playSound('cargo');
        if (!advanceTime(1)) message('RESOURCE LOADED. TRANSPORTING...');
        return;
    }
    if (head.c === 'T' || head.c === 'S') {
        const tether = head.c === 'T';
        const cost = tether ? 5 : 2;
        const flag = tether ? 'upgradeConfirm' : 'speedConfirm';
        if (state.resources < cost) {
            message(`INSUFFICIENT CARGO. (Need ${cost})`, '#ff5555');
        } else if (!state[flag]) {
            state[flag] = true;
            message(tether ? 'UPGRADE TETHER? (5 CARGO, +15 TIME). PRESS EXEC.' : 'UPGRADE SPEED? (2 CARGO). PRESS EXEC.', '#ffff55');
        } else {
            state.resources -= cost;
            if (tether) state.tetherMax += 1;
            else state.transportSpeed += 1;
            state[flag] = false;
            if (!advanceTime(tether ? 15 : 1)) message(tether ? 'TETHER CAPACITY UPGRADED! (+1)' : 'TRANSPORT SPEED UPGRADED! (+1)');
        }
        return;
    }
    const door = findDoor();
    if (door) toggleDoor(door);
    else message('NO INTERACTABLE OBJECTS.', '#ffff55');
}

export function handleScan() {
    if (state.mode !== 'INSTANCE') { message('SCANNER AVAILABLE INSIDE A SITE.', '#ffff55'); return; }
    const result = scanForMotion(state);
    state.scanPings = result.pings;
    playSound('scanner');
    if (!advanceTime(1)) message(`MOTION SCAN: ${result.count} CONTACT${result.count === 1 ? '' : 'S'}. ? = LAST PING.`);
    render();
}

export function handleVent() {
    if (state.mode !== 'INSTANCE') { message('VENT CONTROL AVAILABLE INSIDE A SITE.', '#ffff55'); return; }
    const result = ventAirlock(state);
    if (!result.activated) {
        playSound('blocked');
        message('NO AIRLOCK WITHIN 6 TILES.', '#ffff55');
    } else {
        playSound('vent');
        if (result.droneInDanger) {
            if (!advanceTime(1, { skipThreats: true })) loseActiveDrone('AIRLOCK VENT');
        } else if (!advanceTime(1)) {
            message(`AIRLOCK VENTED. ${result.killed} CREATURE${result.killed === 1 ? '' : 'S'} EXPELLED.`);
        }
    }
    render();
}

export function enterInstance() {
    if (!state.drones.some(drone => drone.alive)) {
        playSound('blocked');
        message('ALL DRONES LOST. START A NEW EXPEDITION AT THE COMMAND CENTER.', '#ff5555');
        return;
    }
    const res = WorldManager.enterInstance(state.worldPos.x, state.worldPos.y);
    if (!res) return;
    state.mode = 'INSTANCE';
    state.map = res.map;
    state.currentInstanceKey = res.instanceKey;
    state.lastDecayCheck = state.time;
    let startX, startY;
    for (let y = 0; y < state.map.length && startX === undefined; y++) {
        for (let x = 0; x < state.map[y].length; x++) {
            if (state.map[y][x] === 'H') { startX = x; startY = y; break; }
        }
    }
    if (startX === undefined && res.startRoom) {
        startX = res.startRoom.cx;
        startY = res.startRoom.cy;
    }
    if (startX === undefined) { state.mode = 'WORLD'; message('SITE HAS NO ACCESS POINT.', '#ff5555'); return; }
    state.probe = { x: startX, y: startY, facing: 'd' };
    state.pathStack = [{ x: startX, y: startY, c: 'H' }];
    state.movingCargo = [];
    state.scanPings = [];
    state.threatClock = 0;
    state.map[startY][startX] = 'H';
    const loc = WorldManager.state.instances[state.currentInstanceKey];
    prepareDoors(loc);
    initializeThreats(state, loc, { x: startX, y: startY }, loc.type);
    updateInstanceCargoVisibility();
    const tile = WorldManager.state.overworld[state.worldPos.y][state.worldPos.x];
    message(`${state.activeDrone} LINK ESTABLISHED: ${(SITE_INFO[tile] || {}).name || 'SITE'}. SCAN FOR MOTION.`);
}

export function exitInstance() {
    const loc = WorldManager.state.instances[state.currentInstanceKey];
    if (loc && loc.type !== 'W' && !loc.looted && !state.map.some(row => row.includes('O'))) {
        loc.looted = true;
        state.sitesLooted += 1;
    }
    if (loc && loc.type !== 'W') {
        WorldManager.updateInstanceState(state.worldPos.x, state.worldPos.y, state.map);
    }
    state.mode = 'WORLD';
    state.evacConfirm = false;
    state.saveConfirm = false;
    state.movingCargo = [];
    state.scanPings = [];
    state.currentInstanceKey = null;
    WorldManager.saveToStorage(state);
    playSound('evac');
    message('DRONE RECOVERED. SITE DATA SAVED.');
}

export function moveInWorld(key) {
    if (!moves[key]) return;
    const [dx, dy] = moves[key];
    const nx = state.worldPos.x + dx, ny = state.worldPos.y + dy;
    if (nx >= 0 && nx < CONFIG.WORLD_SIZE && ny >= 0 && ny < CONFIG.WORLD_SIZE) {
        state.worldPos.x = nx;
        state.worldPos.y = ny;
        WorldManager.state.playerPos = { x: nx, y: ny };
        state.saveConfirm = false;
        playSound('move');
        if (advanceTime(rules.worldStep())) return;
        const tile = WorldManager.state.overworld[ny][nx];
        if (SITE_INFO[tile]) {
            const loc = WorldManager.state.instances[`${nx},${ny}`];
            const tag = loc && loc.looted ? ' (LOOTED)' : (loc && loc.visited ? ' (VISITED)' : '');
            message(`${SITE_INFO[tile].name}${tag}. PRESS EXEC.`);
        }
    }
}
