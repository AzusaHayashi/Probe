// 肉鸽(roguelite) 元进度：跨局保留的 DATA 与永久解锁，以及每局随机的 PERK / CURSE
import { CONFIG } from './constants.js';
import { state } from './gameState.js';

const META_KEY = 'probe_meta';

export const UNLOCKS = [
    { id: 'tether', label: 'REINFORCED TETHER', desc: '+3 starting tether', max: 5, base: 8 },
    { id: 'lens',   label: 'WIDE LENS',         desc: '+0.5 probe vision', max: 4, base: 12 },
    { id: 'winch',  label: 'FAST WINCH',        desc: '+1 transport speed', max: 3, base: 10 },
    { id: 'seed',   label: 'SEED CARGO',        desc: '+2 starting cargo', max: 5, base: 8 },
    { id: 'shield', label: 'FOG SHIELDING',     desc: '+500 min signal, slower fog', max: 4, base: 15 },
    { id: 'hacker', label: 'DOOR HACKER',       desc: 'doors take 1-2 min', max: 1, base: 20 }
];

export const PERKS = [
    { id: 'lucky',  label: 'LUCKY HAUL',   desc: 'more cargo in every site' },
    { id: 'light',  label: 'LIGHT RIG',    desc: 'world steps cost 3 min' },
    { id: 'stable', label: 'STABLE CARGO', desc: 'cargo never rots' },
    { id: 'hot',    label: 'HOT WINCH',    desc: '+1 transport speed' },
    { id: 'long',   label: 'LONG LENS',    desc: '+1 probe vision' }
];

export const CURSES = [
    { id: 'thick',  label: 'THICK FOG',     desc: 'vision shrinks 25% faster' },
    { id: 'short',  label: 'FRAYED LINE',   desc: '-5 starting tether' },
    { id: 'rot',    label: 'ROT',           desc: 'seen cargo rots much faster' },
    { id: 'heavy',  label: 'HEAVY RIG',     desc: 'world steps cost 7 min' },
    { id: 'greedy', label: 'WEAK UPLINK',   desc: 'beacon needs +8 cargo' }
];

export function unlockCost(u, level) {
    return u.base * (level + 1);
}

export function loadMeta() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { /* ignore */ }
    m = m || {};
    m.data = m.data || 0;
    m.levels = m.levels || {};
    m.runs = m.runs || 0;
    m.wins = m.wins || 0;
    m.best = m.best ?? null;
    return m;
}

export function saveMeta(m) {
    localStorage.setItem(META_KEY, JSON.stringify(m));
}

export const meta = loadMeta();

export function lvl(id) {
    return meta.levels[id] || 0;
}

const has = (kind, id) => state.run && state.run[kind] === id;

// ===== 本局实际参数 =====
export const rules = {
    depth: () => (state.run ? state.run.depth : 0),
    uplinkCost: () => CONFIG.UPLINK_COST + 5 * rules.depth() + (has('curse', 'greedy') ? 8 : 0),
    deadline: () => CONFIG.SIGNAL_DEADLINE + 500 * lvl('shield'),
    fogInterval: () => {
        let i = CONFIG.FOG_INTERVAL + 100 * lvl('shield');
        if (has('curse', 'thick')) i = Math.round(i * 0.75);
        return i;
    },
    startTether: () => CONFIG.MAX_TETHER + 3 * lvl('tether') - (has('curse', 'short') ? 5 : 0),
    startSpeed: () => 1 + lvl('winch') + (has('perk', 'hot') ? 1 : 0),
    startCargo: () => 2 * lvl('seed'),
    visionBonus: () => 0.5 * lvl('lens') + (has('perk', 'long') ? 1 : 0),
    worldStep: () => (has('perk', 'light') ? 3 : 5) + (has('curse', 'heavy') ? 2 : 0),
    doorCost: (rng) => (lvl('hacker') ? 1 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 3)),
    cargoBonus: () => (has('perk', 'lucky') ? 0.2 : 0),
    decayChance: () => (has('perk', 'stable') ? 0 : (has('curse', 'rot') ? 1 / 6 : 1 / 20))
};

export function rollRun() {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)].id;
    const clash = { light: 'heavy', stable: 'rot' }; // 互相抵消的组合不要同时出现
    const perk = pick(PERKS);
    let curse;
    do { curse = pick(CURSES); } while (clash[perk] === curse);
    return { perk, curse, depth: meta.wins, rewarded: false };
}

export function findMod(list, id) {
    return list.find(x => x.id === id) || { label: '?', desc: '' };
}

/**
 * 结算本局：胜负都能拿 DATA（只结算一次）
 */
export function rewardRun(won) {
    if (!state.run || state.run.rewarded) return 0;
    const earned = state.totalCollected + 2 * state.sitesLooted + (won ? 15 + 5 * rules.depth() : 0);
    state.run.rewarded = true;
    state.lastReward = earned;
    meta.data += earned;
    meta.runs += 1;
    if (won) {
        meta.wins += 1;
        state.newRecord = meta.best === null || state.time < meta.best;
        if (state.newRecord) meta.best = state.time;
    } else {
        state.newRecord = false;
    }
    saveMeta(meta);
    return earned;
}

export function buyUnlock(index) {
    const u = UNLOCKS[index];
    if (!u) return 'NOTHING';
    const l = lvl(u.id);
    if (l >= u.max) return 'MAXED';
    const cost = unlockCost(u, l);
    if (meta.data < cost) return 'POOR';
    meta.data -= cost;
    meta.levels[u.id] = l + 1;
    saveMeta(meta);
    return 'OK';
}

// ===== 涂装：改变探头 / 钻机颜色（默认绿色免费，其余需 DATA 解锁）=====
export const PAINTS = [
    { id: 'phosphor', label: 'PHOSPHOR WHITE', color: '#ffffff', cost: 0 },
    { id: 'toxic',    label: 'TOXIC GREEN',    color: '#55ff55', cost: 6 },
    { id: 'amber',    label: 'AMBER',          color: '#ffb000', cost: 6 },
    { id: 'ice',      label: 'ICE CYAN',       color: '#55ffff', cost: 8 },
    { id: 'sakura',   label: 'SAKURA PINK',    color: '#ff88cc', cost: 10 },
    { id: 'violet',   label: 'NEON VIOLET',    color: '#bb77ff', cost: 10 },
    { id: 'blood',    label: 'SIGNAL RED',     color: '#ff4444', cost: 12 },
    { id: 'gold',     label: 'GOLD LEAF',      color: '#ffd700', cost: 20 }
];

export function ownsPaint(id) {
    const p = PAINTS.find(x => x.id === id);
    return !!p && (p.cost === 0 || (meta.paints || []).includes(id));
}

export function currentPaint() {
    const p = PAINTS.find(x => x.id === meta.paint);
    return p && ownsPaint(p.id) ? p : PAINTS[0];
}

/** 选择涂装：已拥有就直接装上，否则花 DATA 解锁并装上 */
export function choosePaint(index) {
    const p = PAINTS[index];
    if (!p) return 'NOTHING';
    if (!ownsPaint(p.id)) {
        if (meta.data < p.cost) return 'POOR';
        meta.data -= p.cost;
        meta.paints = [...(meta.paints || []), p.id];
    }
    meta.paint = p.id;
    saveMeta(meta);
    applyPaint();
    return 'OK';
}

export function applyPaint() {
    const c = currentPaint().color;
    document.documentElement.style.setProperty('--paint', c);
}
