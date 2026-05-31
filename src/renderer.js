import { WorldManager } from './worldManager.js';
import { isVisible } from './visibility.js';
import { state } from './gameState.js';
import { CONFIG } from './constants.js';

/**
 * 核心渲染入口
 */
export function render() {
    if (state.mode === 'MENU') {
        renderMenu();
    } else if (state.mode === 'WORLD') {
        renderWorld();
    } else {
        renderInstance();
    }
    
    const valTime = document.getElementById('val-time');
    const valRes = document.getElementById('val-res');
    const valMaxLen = document.getElementById('val-max-len');
    
    if (valTime) valTime.innerText = state.time;
    if (valRes) valRes.innerText = state.resources;
    if (valMaxLen) valMaxLen.innerText = state.tetherMax;
}

/**
 * 渲染大世界地图 — 视口模式，只渲染玩家周围区域
 */
export function renderWorld() {
    let html = "";
    const worldMap = WorldManager.state.overworld;
    const px = state.worldPos.x;
    const py = state.worldPos.y;
    const viewRadius = state.worldViewRadius || 10;
    const padding = 3;
    const viewportSize = viewRadius + padding;

    const yStart = Math.max(0, py - viewportSize);
    const yEnd = Math.min(worldMap.length, py + viewportSize + 1);
    const xStart = Math.max(0, px - viewportSize);
    const xEnd = Math.min(worldMap[0]?.length || 50, px + viewportSize + 1);

    for(let y = yStart; y < yEnd; y++) {
        html += "<div>";
        for(let x = xStart; x < xEnd; x++) {
            let isP = (x === px && y === py);
            let dx = x - px, dy = y - py;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let inSight = dist <= viewRadius;
            let key = x + "," + y;
            let revealed = WorldManager.state.revealedTiles[key];

            let char, className;

            if (isP) {
                char = "@";
                className = "obj-highlight";
            } else if (inSight) {
                char = worldMap[y][x];
                if (char !== ".") {
                    const loc = WorldManager.state.instances[key];
                    let isVisited = loc && loc.visited;
                    if (revealed) {
                        revealed.visible = true;
                    } else {
                        WorldManager.state.revealedTiles[key] = { tile: char, visible: true };
                    }
                    WorldManager.state.explored.add(key);
                    className = isVisited ? "explored-highlight" : "lit";
                } else {
                    char = ".";
                    className = "lit";
                }
            } else {
                if (revealed && revealed.visible) {
                    char = revealed.tile;
                    className = "dim";
                } else {
                    char = ".";
                    className = "fog";
                }
            }

            html += '<span class="' + className + '">' + char + "</span>";
        }
        html += "</div>";
    }
    const screen = document.getElementById("game-screen");
    if (screen) screen.innerHTML = html;
}

/**
 * 渲染地牢实例 — 视口模式，只渲染探头周围区域
 */
export function renderInstance() {
    let html = "";
    const cargoMap = new Set();
    state.movingCargo.forEach(function(c) {
        const pos = state.pathStack[Math.floor(c.pathIndex)];
        if (pos) cargoMap.add(pos.x + "," + pos.y);
    });

    const currentMapSize = state.map.length;
    const loc = WorldManager.state.instances[state.currentInstanceKey];

    const px = state.probe.x;
    const py = state.probe.y;
    const viewDist = Math.ceil(CONFIG.VIEW_DIST || 6) + 3;
    const vpSize = Math.max(viewDist, 10);

    const yStart = Math.max(0, py - vpSize);
    const yEnd = Math.min(currentMapSize, py + vpSize + 1);
    const xStart = Math.max(0, px - vpSize);
    const xEnd = Math.min(currentMapSize, px + vpSize + 1);

    for(let y = yStart; y < yEnd; y++) {
        html += "<div>";
        for(let x = xStart; x < xEnd; x++) {
            const key = x + "," + y;
            const isP = (x === state.probe.x && y === state.probe.y);
            const isCargo = cargoMap.has(key);
            const inSight = isVisible(x, y, state.probe, state.map);
            const hasBeenSeen = loc && loc.revealedPoints && loc.revealedPoints.has(key);
            
            let char = state.map[y][x];
            const isPipeline = (char === "|" || char === "-" || char === "H");

            if (isP) {
                var dirs = {w:"^",s:"v",a:"<",d:">"};
                char = dirs[state.probe.facing];
            } else if (isCargo) {
                char = "O";
            }

            let className = "fog";
            if (inSight || isP || isCargo) {
                className = "obj-highlight";
            } else if (isPipeline) {
                className = "obj-highlight";
            } else if (hasBeenSeen) {
                className = "dim";
            } else {
                char = " ";
                className = "fog";
            }

            html += '<span class="' + className + '">' + char + "</span>";
        }
        html += "</div>";
    }
    const screen = document.getElementById("game-screen");
    if (screen) screen.innerHTML = html;
    
    const valLen = document.getElementById("val-len");
    if (valLen) valLen.innerText = (state.tetherMax - state.pathStack.length + 1) + "";
}

/**
 * 渲染菜单界面
 */
export function renderMenu() {
    let html = '<div class="menu-container">';
    html += '<h2 style="color: #55ff55; text-align: center;">--- COMMAND CENTER ---</h2>';
    html += '<div style="margin-bottom: 20px; text-align: center; color: #aaa;">Current Resources: <span style="color: #fff;">' + state.resources + '</span></div>';
    
    state.menu.options.forEach(function(opt, index) {
        const isSelected = index === state.menu.currentIndex;
        const prefix = isSelected ? "> " : "  ";
        const style = isSelected ? "color: #fff; background: #222;" : "color: #888;";
        const costText = opt.cost > 0 ? " (Cost: " + opt.cost + " Cargo)" : "";
        
        html += '<div style="padding: 10px; margin: 5px 0; cursor: pointer; ' + style + '">';
        html += prefix + opt.label + costText;
        html += "</div>";
    });
    
    if (state.menu.confirming) {
        html += '<div style="margin-top: 30px; text-align: center; color: #ffff00; border: 1px dashed #ffff00; padding: 10px;">';
        html += "ARE YOU SURE? (Press EXEC to Confirm)";
        html += "</div>";
    }
    
    html += "</div>";
    
    const screen = document.getElementById("game-screen");
    if (screen) screen.innerHTML = html;
}
