import { WorldManager } from './worldManager.js';
import { isVisible } from './visibility.js';

export const state = {
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

/**
 * 推进时间并处理相关逻辑（如资源包移动）
 */
export function advanceTime(amount) {
    state.time += amount;

    // 只有在探索模式下，时间增加才会处理相关逻辑
    if (state.mode === 'INSTANCE') {
        if (state.movingCargo.length > 0) {
            // 时间增加 amount，资源包移动 amount * transportSpeed
            const moveDist = amount * state.transportSpeed;
            state.movingCargo.forEach(cargo => {
                cargo.pathIndex -= moveDist;
            });
            checkCargoCollection(); // 检查是否到达回收点
        }
        checkCargoDecay();      // 检查资源包衰减
        updateInstanceCargoVisibility(); // 始终更新可见状态
    }
}

/**
 * 检查并回收已到达本体的资源包
 */
export function checkCargoCollection() {
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

    const loc = WorldManager.state.instances[state.currentInstanceKey];
    if (!loc || !loc.cargoSeen) return;

    // 每200time检测一次
    if (state.time > 0 && state.time - state.lastDecayCheck >= 200) {
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
export function updateInstanceCargoVisibility() {
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
