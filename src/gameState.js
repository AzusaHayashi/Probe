import { WorldManager } from "./worldManager.js";
import { isVisible } from "./visibility.js";

export const state = {
    mode: "WORLD",
    worldPos: { x: 5, y: 5 },
    map: [],
    pathStack: [],
    probe: { x: 0, y: 0, facing: "d" },
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
    worldViewRadius: 10,
    lastFogReductionTime: 0,
    menu: {
        options: [
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
export function advanceTime(amount) {
    state.time += amount;

    // 每 1000 分钟减少 1 格大世界视野（增量判断，不累积）
    if (state.time - state.lastFogReductionTime >= 1000) {
        if (state.worldViewRadius > 1) {
            state.worldViewRadius -= 1;
        }
        state.lastFogReductionTime = state.time;
        const log = document.getElementById("log");
        if (log) {
            log.style.color = "#ff5555";
            log.innerText = "Fog grows thicker.";
        }
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
    }
}

/**
 * 检查并回收已到达本体的资源包
 */
export function checkCargoCollection() {
    var initialCount = state.movingCargo.length;
    state.movingCargo = state.movingCargo.filter(function(cargo) {
        if (cargo.pathIndex <= 0) {
            state.resources += 1;
            return false;
        }
        return true;
    });

    if (state.movingCargo.length < initialCount) {
        var log = document.getElementById("log");
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
                        if (Math.random() < 1/20) {
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
