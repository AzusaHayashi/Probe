import { state, createDroneSquad } from './gameState.js';
import { WorldManager } from './worldManager.js';
import { CONFIG } from './constants.js';
import { rules, rewardRun, rollRun } from './meta.js';

export function optionCost(option) {
    return option.id === 'launch_uplink' ? rules.uplinkCost() : option.cost;
}

/**
 * 处理菜单界面的输入
 */
export function handleMenuInput(key) {
    const menu = state.menu;
    const log = document.getElementById('log');

    if (menu.confirming) {
        if (key === 'exec') {
            executeMenuOption(menu.options[menu.currentIndex]);
            menu.confirming = false;
        } else if (['w', 's', 'a', 'd'].includes(key)) {
            // 任何移动键取消确认
            menu.confirming = false;
            if (log) {
                log.style.color = "#55ff55";
                log.innerText = "ACTION CANCELLED.";
            }
        }
        return;
    }

    if (key === 'w') {
        menu.currentIndex = (menu.currentIndex - 1 + menu.options.length) % menu.options.length;
    } else if (key === 's') {
        menu.currentIndex = (menu.currentIndex + 1) % menu.options.length;
    } else if (key === 'exec') {
        const option = menu.options[menu.currentIndex];
        
        // 检查资源是否足够
        if (optionCost(option) > 0 && state.resources < optionCost(option)) {
            if (log) {
                log.style.color = "#ff5555";
                log.innerText = `INSUFFICIENT CARGO! (Need ${optionCost(option)})`;
            }
            return;
        }

        menu.confirming = true;
        if (log) {
            log.style.color = "#ffff00";
            log.innerText = `CONFIRM: ${option.label}? (EXEC = yes, move = cancel)`;
        }
    }
}

/**
 * 执行菜单选项
 */
function executeMenuOption(option) {
    const log = document.getElementById('log');

    switch (option.id) {
        case 'launch_uplink':
            state.resources -= optionCost(option);
            state.overlay = 'WIN';
            state.runActive = false;
            rewardRun(true);
            localStorage.removeItem('scavenge_world_data');
            break;

        case 'upgrade_view':
            state.resources -= option.cost;
            // 修改常量配置中的视野范围（或增加一个新的偏移量状态）
            // 这里我们假设 CONFIG.VIEW_DIST 需要增加，由于 CONFIG 是导入的，
            // 更好的做法是在 state 中维护一个视野偏移量
            state.probeVisionBonus = (state.probeVisionBonus || 0) + 1;
            if (log) {
                log.style.color = "#55ff55";
                log.innerText = "PROBE VISION UPGRADED!";
            }
            WorldManager.saveToStorage(state);
            break;

        case 'export_save':
            exportSaveData();
            break;

        case 'continue_current':
            continueCurrentWorld();
            break;

        case 'continue_exploration':
            resetWorld();
            break;
    }
}

/**
 * 继续当前世界的探索（仅切换模式）
 */
function continueCurrentWorld() {
    const log = document.getElementById('log');
    state.mode = 'WORLD';
    if (log) {
        log.style.color = "#55ff55";
        log.innerText = "EXPEDITION RESUMED.";
    }
}

/**
 * 导出存档
 */
function exportSaveData() {
    const log = document.getElementById('log');
    // 导出前先执行一次保存，确保 state 数据进入 localStorage
    WorldManager.saveToStorage(state);
    
    const saveData = localStorage.getItem('scavenge_world_data');
    if (saveData) {
        const blob = new Blob([saveData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `probe_save_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (log) {
            log.style.color = "#55ff55";
            log.innerText = "SAVE DATA EXPORTED SUCCESSFULLY.";
        }
    } else if (log) {
        log.style.color = "#ff5555";
        log.innerText = "ERROR: NO SAVE DATA FOUND.";
    }
}

/**
 * 重新生成世界并重置探索状态
 */
function resetWorld() {
    const log = document.getElementById('log');
    rewardRun(false); // 放弃本局也结算 DATA
    startNewExpedition();
    state.overlay = 'BRIEFING';
    if (log) {
        log.style.color = "#55ff55";
        log.innerText = "NEW EXPEDITION STARTED. WORLD REGENERATED.";
    }
}

/**
 * 完全重置：新世界、新资源、新升级
 */
export function startNewExpedition() {
    state.run = rollRun();
    state.runActive = true;
    state.time = 0;
    state.resources = rules.startCargo();
    state.totalCollected = 0;
    state.sitesLooted = 0;
    state.probeVisionBonus = 0;
    state.tetherMax = rules.startTether();
    state.transportSpeed = rules.startSpeed();
    state.worldViewRadius = CONFIG.START_VIEW_RADIUS;
    state.lastFogReductionTime = 0;
    state.movingCargo = [];
    state.currentInstanceKey = null;
    state.drones = createDroneSquad();
    state.activeDrone = 'D1';
    state.creatures = [];
    state.airlocks = [];
    state.scanPings = [];
    state.threatClock = 0;
    state.lossReason = null;
    state.mode = 'WORLD';
    state.menu.currentIndex = 0;
    state.menu.confirming = false;

    WorldManager.state.instances = {};
    WorldManager.state.revealedTiles = {};
    WorldManager.state.explored = new Set();
    WorldManager.init(Math.floor(Math.random() * 999999));
    state.worldPos = { ...WorldManager.state.playerPos };
    WorldManager.saveToStorage(state);
}
