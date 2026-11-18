import { WorldManager } from './worldManager.js';
import { isVisible } from './visibility.js';
import { state } from './gameState.js';
import { CONFIG, SITE_INFO } from './constants.js';
import { rules, meta, lvl, UNLOCKS, PAINTS, PERKS, CURSES, unlockCost, ownsPaint, currentPaint, findMod } from './meta.js';
import { optionCost } from './menuManager.js';

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

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('val-time', state.time);
    set('val-res', state.resources);
    set('val-goal', rules.uplinkCost());
    set('val-max-len', state.tetherMax);
    set('val-signal', Math.max(0, rules.deadline() - state.time));
    if (state.mode !== 'INSTANCE') set('val-len', state.tetherMax);

    const signal = document.getElementById('val-signal');
    if (signal) signal.style.color = (rules.deadline() - state.time) < 2000 ? '#ff5555' : '';

    renderLegend();
    renderOverlay();
}

const LEGENDS = {
    WORLD: '@ you · F factory · S supermarket · M mine · W workshop · E evac/save · I command center',
    INSTANCE: '^>v< probe · O cargo · + door (EXEC next to it) · H base · walk back along the tether to retract',
    MENU: '↑↓ choose · EXEC select'
};

function renderLegend() {
    const el = document.getElementById('legend');
    if (!el) return;
    let text = LEGENDS[state.mode] || '';
    if (state.mode === 'INSTANCE') {
        const loc = WorldManager.state.instances[state.currentInstanceKey];
        if (loc && loc.type === 'W') text = 'T tether +1 (5 cargo) · S speed +1 (2 cargo) · stand on it, EXEC · H exit';
    }
    el.innerText = text;
}

/**
 * 机库列表：永久升级 + 涂装 + 出发
 */
export function hangarItems() {
    const items = [];
    UNLOCKS.forEach((u, i) => items.push({ kind: 'unlock', index: i }));
    PAINTS.forEach((p, i) => items.push({ kind: 'paint', index: i }));
    items.push({ kind: 'launch' });
    return items;
}

function runModsLine() {
    if (!state.run || !state.run.perk) return '';
    const perk = findMod(PERKS, state.run.perk), curse = findMod(CURSES, state.run.curse);
    return `<p><span class="perk">PERK ${perk.label}</span>: ${perk.desc}<br><span class="curse">CURSE ${curse.label}</span>: ${curse.desc}</p>`;
}

function renderHangar() {
    const items = hangarItems();
    let html = `<h2 class="win">--- HANGAR ---</h2>
<p style="text-align:center">DATA: <b>${meta.data}</b> · runs ${meta.runs} · wins ${meta.wins}${meta.best !== null ? ' · best ' + meta.best + ' min' : ''}</p>`;
    let lastKind = '';
    items.forEach((it, idx) => {
        if (it.kind !== lastKind) {
            if (it.kind === 'unlock') html += '<div class="sec">PERMANENT UPGRADES</div>';
            if (it.kind === 'paint') html += '<div class="sec">PAINT BOOTH</div>';
            if (it.kind === 'launch') html += '<div class="sec">&nbsp;</div>';
            lastKind = it.kind;
        }
        const sel = idx === state.hangarIndex;
        let text = '', right = '';
        if (it.kind === 'unlock') {
            const u = UNLOCKS[it.index], l = lvl(u.id);
            text = `${u.label} <span class="dim-line">${u.desc}</span>`;
            right = l >= u.max ? `MAX` : `Lv${l}/${u.max} · ${unlockCost(u, l)} DATA`;
        } else if (it.kind === 'paint') {
            const p = PAINTS[it.index];
            text = `<span style="color:${p.color};text-shadow:0 0 6px ${p.color}">■ @ ^</span> ${p.label}`;
            right = currentPaint().id === p.id ? 'EQUIPPED' : (ownsPaint(p.id) ? 'OWNED' : `${p.cost} DATA`);
        } else {
            text = state.runActive ? '&gt;&gt; BACK TO CURRENT RUN' : '&gt;&gt; LAUNCH NEW RUN';
        }
        html += `<div class="h-item${sel ? ' sel' : ''}" data-idx="${idx}"><span>${sel ? '&gt; ' : ''}${text}</span><span class="h-right">${right}</span></div>`;
    });
    html += `<p class="dim-line" style="text-align:center">↑↓ choose · EXEC buy / equip / launch · tap works too</p>`;
    return html;
}

/**
 * 标题 / 帮助 / 机库 / 简报 / 胜利 / 失败 覆盖层
 */
export function renderOverlay() {
    const el = document.getElementById('overlay');
    if (!el) return;
    if (!state.overlay) { el.style.display = 'none'; return; }
    el.style.display = 'flex';

    const bestLine = meta.best !== null ? `<p class="dim-line">BEST RUN: uplink at ${meta.best} min</p>` : '';
    const dataLine = `<p>DATA earned: <b>+${state.lastReward || 0}</b> · bank: <b>${meta.data}</b></p>`;

    let html = '';
    if (state.overlay === 'TITLE' || state.overlay === 'HELP') {
        html = `
<pre class="logo">
 ___  ___  ___  ___  ___
| _ \\| _ \\/ _ \\| _ )| __|
|  _/|   / (_) | _ \\| _|
|_|  |_|_\\\\___/|___/|___|
</pre>
<p>The fog is eating the world. You run a tethered probe from a mobile rig.</p>
<p><b>GOAL:</b> haul <b>${rules.uplinkCost()} cargo</b> to the <b>COMMAND CENTER (I)</b> and launch the uplink beacon before the signal dies at <b>${rules.deadline()} min</b>.</p>
<ul>
<li>Overworld: walk onto <b>F</b>/<b>S</b>/<b>M</b> and press EXEC to send the probe in. Each step costs time. Vision shrinks as time passes.</li>
<li>Probe: the first press turns it, the next moves. It only sees in a cone. Walking back over the tether retracts it.</li>
<li>Stand on <b>O</b> and press EXEC: cargo rides the tether home. Seen cargo can rot away, so grab it fast.</li>
<li>EXEC beside a <b>+</b> door to hack it. Return to <b>H</b> and press EXEC twice to evacuate.</li>
<li><b>W</b> workshop: longer tether, faster transport. <b>I</b>: the beacon, vision upgrade, export save.</li>
<li><b>Roguelite:</b> every run, won or lost, earns <b>DATA</b>. Spend it in the <b>HANGAR</b> on permanent upgrades and paint. Each run deals a random perk and curse. Every win makes the next beacon cost more.</li>
</ul>
<p class="dim-line">Keys: WASD / arrows, Space / Enter = EXEC. On phone use the pad.</p>
${bestLine}
<p class="blink">PRESS EXEC TO ${state.overlay === 'HELP' ? 'RESUME' : (state.runActive ? 'CONTINUE RUN' : 'ENTER HANGAR')}</p>`;
    } else if (state.overlay === 'HANGAR') {
        html = renderHangar();
    } else if (state.overlay === 'BRIEFING') {
        html = `
<h2 class="win">RUN BRIEFING${rules.depth() ? ' · DEPTH ' + rules.depth() : ''}</h2>
${runModsLine()}
<p>Beacon: <b>${rules.uplinkCost()} cargo</b> · Signal: <b>${rules.deadline()} min</b> · Tether: <b>${state.tetherMax}</b> · Start cargo: <b>${state.resources}</b></p>
<p class="blink">PRESS EXEC TO DEPLOY</p>`;
    } else if (state.overlay === 'WIN') {
        html = `
<h2 class="win">UPLINK ESTABLISHED</h2>
<p>The beacon cuts through the fog. Rescue is inbound.</p>
<p>Time: <b>${state.time} min</b> · Cargo hauled: <b>${state.totalCollected}</b> · Sites cleared: <b>${state.sitesLooted}</b></p>
${dataLine}
${state.newRecord ? '<p class="win">NEW BEST RUN!</p>' : bestLine}
<p>Next run goes deeper: the beacon needs 5 more cargo.</p>
<p class="blink">PRESS EXEC FOR THE HANGAR</p>`;
    } else if (state.overlay === 'LOSE') {
        html = `
<h2 class="lose">SIGNAL LOST</h2>
<p>The fog closed in at ${rules.deadline()} min. The rig goes dark.</p>
<p>Cargo hauled: <b>${state.totalCollected}</b> · In the hold: <b>${state.resources}</b>/${rules.uplinkCost()} · Sites cleared: <b>${state.sitesLooted}</b></p>
${dataLine}
<p class="blink">PRESS EXEC FOR THE HANGAR</p>`;
    }
    el.innerHTML = '<div class="overlay-box">' + html + '</div>';
    const sel = el.querySelector('.h-item.sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
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
    const xEnd = Math.min(worldMap[0]?.length || CONFIG.WORLD_SIZE, px + viewportSize + 1);

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
                className = "me";
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
                    className = (loc && loc.looted) ? "looted" : (isVisited ? "explored-highlight" : "lit");
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
    const viewDist = Math.ceil(CONFIG.VIEW_DIST + (state.probeVisionBonus || 0)) + 3;
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
            if (isP) {
                className = "me";
            } else if (inSight || isCargo) {
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
    html += '<div style="margin-bottom: 20px; text-align: center; color: #aaa;">Cargo in hold: <span style="color: #fff;">' + state.resources + '</span> / ' + CONFIG.UPLINK_COST + ' for the beacon</div>';
    
    state.menu.options.forEach(function(opt, index) {
        const isSelected = index === state.menu.currentIndex;
        const prefix = isSelected ? "> " : "  ";
        const style = isSelected ? "color: #fff; background: #222;" : "color: #888;";
        const c = optionCost(opt);
        const costText = c > 0 ? " (Cost: " + c + " Cargo)" : "";
        
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
