import { WorldManager } from "./worldManager.js";
import { isVisible } from "./visibility.js";
import { CONFIG } from "./constants.js";
import { rules, rewardRun } from "./meta.js";
import { advanceThreats, resetMotionMemory, secureDeploymentPoint } from "./threats.js";
import { playSound } from "./audio.js";

export function createDroneSquad() {
    return ["D1", "D2", "D3"].map(id => ({ id, name: id, alive: true }));
}

export const state = {
    mode: "WORLD",          // WORLD | INSTANCE | MENU
    overlay: null,          // null | TITLE | HELP | HANGAR | BRIEFING | WIN | LOSE
    run: null,              // 本局 { perk, curse, depth, rewarded }
    runActive: false,
    hangarIndex: 0,
    probeVisionBonus: 0,
    totalCollected: 0,
    sitesLooted: 0,
    worldPos: { x: 5, y: 5 },
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: "d" },
    drones: createDroneSquad(),
    activeDrone: "D1",
    creatures: [],
    airlocks: [],
    scanPings: [],
    threatClock: 0,
    lossReason: null,
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
    lastDecayCheck: 0,
    worldViewRadius: CONFIG.START_VIEW_RADIUS,
    lastFogReductionTime: 0,
    menu: {
        options: [
            { id: "launch_uplink", label: "LAUNCH UPLINK BEACON (WIN)", cost: CONFIG.UPLINK_COST, dynamic: true },
            { id: "upgrade_view", label: "UPGRADE PROBE VISION (+1)", cost: 20 },
            { id: "export_save", label: "EXPORT DATA TO FILE", cost: 0 },
            { id: "continue_current", label: "CONTINUE EXPLORATION (KEEP WORLD)", cost: 0 },
            { id: "continue_exploration", label: "NEW EXPEDITION (RESET WORLD)", cost: 0 }
        ],
        currentIndex: 0,
        confirming: false
    }
};

/**
 * 推进时间并处理相关逻辑（如资源包移动）
 */
export function advanceTime(amount, { skipThreats = false } = {}) {
    state.time += amount;
    state.scanPings = state.scanPings.filter(ping => ping?.expiresAt > state.time);

    // 视野随时间缩减：每 FOG_INTERVAL 分钟 -1（按总时间计算，跨越多个区间也正确）
    const targetRadius = Math.max(1, CONFIG.START_VIEW_RADIUS - Math.floor(state.time / rules.fogInterval()));
    if (targetRadius < state.worldViewRadius) {
        state.worldViewRadius = targetRadius;
        state.lastFogReductionTime = state.time;
        const log = globalThis.document?.getElementById("log");
        if (log) {
            log.style.color = "#ff5555";
            log.innerText = "FOG GROWS THICKER. WORLD VISION -1.";
        }
    }

    // 信号彻底消失 = 远征失败
    if (state.runActive && state.time >= rules.deadline()) {
        state.overlay = "LOSE";
        state.lossReason = "signal";
        state.runActive = false;
        rewardRun(false);
        localStorage.removeItem("scavenge_world_data");
        return true;
    }

    // 只有在探索模式下，时间增加才会处理相关逻辑
    if (state.mode === "INSTANCE") {
        if (state.movingCargo.length > 0) {
            const moveDist = amount * state.transportSpeed;
            state.movingCargo.forEach(function(cargo) {
                cargo.pathIndex -= moveDist;
            });
            checkCargoCollection();
        }
        checkCargoDecay();
        updateInstanceCargoVisibility();

        if (!skipThreats) {
            // Carry partial time between actions, but never advance threats in the world.
            state.threatClock += amount;
            const steps = Math.floor(state.threatClock / 2);
            state.threatClock %= 2;
            const contact = state.creatures.some(creature =>
                creature?.x === state.probe.x && creature?.y === state.probe.y);
            const attacked = contact || advanceThreats(state, steps).attacked;
            if (attacked && state.drones.some(drone => drone.id === state.activeDrone && drone.alive)) {
                playSound("creature");
                return loseActiveDrone("CREATURE ATTACK");
            }
        }
    }
    return false;
}

/** Permanently lose the deployed drone, recovering the site before saving. */
export function loseActiveDrone(cause) {
    // For example, a vent action may reach the signal deadline on its time cost.
    // Do not overwrite that result or recreate a resumable save afterwards.
    if (!state.runActive && (state.overlay === "LOSE" || state.overlay === "WIN")) return false;
    const drone = state.drones.find(item => item.id === state.activeDrone && item.alive);
    if (!drone) return false;
    drone.alive = false;

    const loc = WorldManager.state.instances[state.currentInstanceKey];
    let home = state.pathStack[0];
    if (!home || !state.map[home.y] || home.x < 0 || home.x >= state.map[home.y].length) {
        home = null;
        for (let y = 0; y < state.map.length && !home; y++) {
            const x = state.map[y].indexOf("H");
            if (x !== -1) home = { x, y, c: "H" };
        }
    }
    for (const point of state.pathStack) {
        if (!state.map[point.y] || point.x < 0 || point.x >= state.map[point.y].length) continue;
        const key = `${point.x},${point.y}`;
        if (point === home || point.c === "H") {
            state.map[point.y][point.x] = "H";
        } else if (loc?.doors && Object.hasOwn(loc.doors, key)) {
            state.map[point.y][point.x] = loc.doors[key] ? "." : "+";
        } else {
            // Includes airlocks, workshops and uncollected cargo, not just floor.
            state.map[point.y][point.x] = point.c;
        }
    }
    state.movingCargo = [];
    state.scanPings = [];
    resetMotionMemory(state);
    state.threatClock = 0;
    state.evacConfirm = false;
    state.upgradeConfirm = false;
    state.speedConfirm = false;
    const next = state.drones.find(item => item.alive);
    state.activeDrone = next?.id ?? null;
    if (home && next) {
        state.probe = { x: home.x, y: home.y, facing: "d" };
        state.pathStack = [{ x: home.x, y: home.y, c: "H" }];
        secureDeploymentPoint(state);
        updateInstanceCargoVisibility();
    } else {
        state.pathStack = [];
        // A damaged map with no home cannot host the next drone safely.
        if (next) {
            state.mode = "WORLD";
            state.currentInstanceKey = null;
        }
    }
    // Keep the location-owned creature/airlock arrays attached and persist the
    // recovered terrain, including for newly generated sites and workshops.
    if (loc) loc.savedMap = state.map;
    playSound("drone-lost");

    if (next) {
        // Persist all live run data, not just the site, before play can continue.
        WorldManager.saveToStorage(state);
    } else {
        state.overlay = "LOSE";
        state.lossReason = "squad";
        state.runActive = false;
        rewardRun(false);
        localStorage.removeItem("scavenge_world_data");
    }

    const log = globalThis.document?.getElementById("log");
    if (log) {
        log.style.color = "#ff5555";
        log.innerText = next
            ? `${cause}: ${drone.name} LOST. ${next.name} DEPLOYED AT BASE.`
            : `${cause}: ${drone.name} LOST. SQUAD DESTROYED.`;
    }
    return true;
}

/**
 * 检查并回收已到达本体的资源包
 */
export function checkCargoCollection() {
    var initialCount = state.movingCargo.length;
    state.movingCargo = state.movingCargo.filter(function(cargo) {
        if (cargo.pathIndex <= 0) {
            state.resources += 1;
            state.totalCollected += 1;
            return false;
        }
        return true;
    });

    if (state.movingCargo.length < initialCount) {
        var log = globalThis.document?.getElementById("log");
        if (log) {
            log.style.color = "#55ff55";
            log.innerText = "CARGO SECURED (+1)";
        }
    }
}

/**
 * 每200time检测一次视野内未被拾取的资源包，有1/20概率消失
 */
export function checkCargoDecay() {
    if (!state.currentInstanceKey) return;

    var loc = WorldManager.state.instances[state.currentInstanceKey];
    if (!loc || !loc.cargoSeen) return;

    if (state.time > 0 && state.time - state.lastDecayCheck >= 200) {
        state.lastDecayCheck = state.time;

        for (var y = 0; y < state.map.length; y++) {
            for (var x = 0; x < state.map[y].length; x++) {
                if (state.map[y][x] === "O") {
                    var key = x + "," + y;
                    if (loc.cargoSeen.has(key) && !loc.cargoGone?.has(key)) {
                        if (Math.random() < rules.decayChance()) {
                            if (!loc.cargoGone) loc.cargoGone = new Set();
                            loc.cargoGone.add(key);
                            state.map[y][x] = ".";
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
export function updateInstanceCargoVisibility() {
    if (!state.currentInstanceKey) return;

    var loc = WorldManager.state.instances[state.currentInstanceKey];
    if (!loc) return;

    if (!loc.revealedPoints) loc.revealedPoints = new Set();

    var px = state.probe.x;
    var py = state.probe.y;
    
    for (var y = 0; y < state.map.length; y++) {
        for (var x = 0; x < state.map[y].length; x++) {
            if (isVisible(x, y, state.probe, state.map)) {
                var key = x + "," + y;
                loc.revealedPoints.add(key);

                if (state.map[y][x] === "O") {
                    loc.cargoSeen.add(key);
                    if (loc.cargoGone?.has(key)) {
                        loc.cargoGone.delete(key);
                        state.map[y][x] = "O";
                    }
                }
            }
        }
    }
}
