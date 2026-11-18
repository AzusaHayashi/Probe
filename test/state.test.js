import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(String(key), String(value)); }
    removeItem(key) { this.data.delete(key); }
    clear() { this.data.clear(); }
}

globalThis.localStorage = new MemoryStorage();
// Intentionally no document: state operations must work without a DOM.
delete globalThis.document;
const { state, createDroneSquad, advanceTime, loseActiveDrone } = await import('../src/gameState.js');
const { WorldManager } = await import('../src/worldManager.js');
const { meta, rules } = await import('../src/meta.js');
const initialState = structuredClone(state);
const storageKey = 'scavenge_world_data';

function setupInstance() {
    const map = [
        [...'#########'],
        [...'#H----..#'],
        [...'#########']
    ];
    const creatures = [{ id: 'c1', x: 7, y: 1 }];
    const airlocks = [{ x: 2, y: 1 }];
    const loc = {
        type: 'F', seed: 1, savedMap: map, creatures, airlocks,
        doors: { '3,1': false, '4,1': true },
        cargoSeen: new Set(), cargoGone: new Set(), revealedPoints: new Set()
    };
    WorldManager.state.instances['5,5'] = loc;
    Object.assign(state, {
        mode: 'INSTANCE', currentInstanceKey: '5,5', map,
        pathStack: [
            { x: 1, y: 1, c: 'H' }, { x: 2, y: 1, c: 'A' },
            { x: 3, y: 1, c: '.' }, { x: 4, y: 1, c: '.' },
            { x: 5, y: 1, c: '.' }
        ],
        probe: { x: 5, y: 1, facing: 'd' }, creatures, airlocks,
        movingCargo: [{ pathIndex: 4 }],
        run: { perk: 'hot', curse: 'thick', depth: 2, rewarded: false },
        runActive: true, time: 110, resources: 3, totalCollected: 7, sitesLooted: 2,
        probeVisionBonus: 3, tetherMax: 41, transportSpeed: 2,
        worldViewRadius: 8, lastFogReductionTime: 101,
        threatClock: 1, scanPings: [{ x: 7, y: 1, expiresAt: 115 }],
        evacConfirm: true, upgradeConfirm: true, speedConfirm: true
    });
    return loc;
}

beforeEach(() => {
    localStorage.clear();
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, structuredClone(initialState));
    Object.assign(meta, { data: 0, levels: {}, runs: 0, wins: 0, best: null });
    WorldManager.state = {
        globalSeed: 1, overworld: [], instances: {}, playerPos: { x: 5, y: 5 },
        currentMode: 'WORLD', explored: new Set(), revealedTiles: {}, cargoDecayChecked: new Set()
    };
});

test('fresh rosters have independent, living D1-D3 entries', () => {
    const first = createDroneSquad();
    const second = createDroneSquad();
    assert.deepEqual(first, ['D1', 'D2', 'D3'].map(id => ({ id, name: id, alive: true })));
    first[0].alive = false;
    assert.equal(second[0].alive, true);
});

test('save/load retains squad, live run statistics, upgrades, location threats and sets', () => {
    const loc = setupInstance();
    state.drones[0].alive = false;
    state.activeDrone = 'D2';
    loc.cargoSeen.add('6,1');
    loc.cargoGone.add('7,1');
    loc.revealedPoints.add('1,1');
    WorldManager.state.explored.add('5,5');
    WorldManager.saveToStorage(state);
    // A world-only autosave must not discard the last complete global state.
    WorldManager.saveToStorage();
    const saved = JSON.parse(localStorage.getItem(storageKey));
    assert.deepEqual(saved.globalGameState, {
        time: 110, resources: 3, probeVisionBonus: 3, tetherMax: 41, transportSpeed: 2,
        worldViewRadius: 8, lastFogReductionTime: 101, totalCollected: 7, sitesLooted: 2,
        run: { perk: 'hot', curse: 'thick', depth: 2, rewarded: false },
        drones: state.drones, activeDrone: 'D2'
    });

    const target = { runActive: false };
    WorldManager.loadFromStorage(target);
    assert.equal(target.runActive, true);
    assert.deepEqual(target.drones, state.drones);
    assert.equal(target.activeDrone, 'D2');
    for (const field of ['time', 'resources', 'probeVisionBonus', 'tetherMax', 'transportSpeed',
        'worldViewRadius', 'lastFogReductionTime', 'totalCollected', 'sitesLooted', 'run']) {
        assert.deepEqual(target[field], state[field], field);
    }
    const restored = WorldManager.state.instances['5,5'];
    assert.deepEqual(restored.creatures, loc.creatures);
    assert.deepEqual(restored.airlocks, loc.airlocks);
    assert.deepEqual(restored.doors, loc.doors);
    assert.deepEqual(restored.cargoSeen, new Set(['6,1']));
    assert.deepEqual(restored.cargoGone, new Set(['7,1']));
    assert.deepEqual(restored.revealedPoints, new Set(['1,1']));
    assert.deepEqual(WorldManager.state.explored, new Set(['5,5']));
});

test('legacy saves reset stale rosters without resetting their live run parameters', () => {
    setupInstance();
    WorldManager.saveToStorage(state);
    const save = JSON.parse(localStorage.getItem(storageKey));
    delete save.globalGameState.drones;
    delete save.globalGameState.activeDrone;
    localStorage.setItem(storageKey, JSON.stringify(save));
    const target = { drones: [{ id: 'D1', name: 'D1', alive: false }], activeDrone: null };
    assert.equal(WorldManager.loadFromStorage(target), true);
    assert.deepEqual(target.drones, createDroneSquad());
    assert.equal(target.activeDrone, 'D1');
    assert.equal(target.resources, 3);
    assert.equal(target.time, 110);
    assert.equal(target.transportSpeed, 2);
    assert.equal(target.worldViewRadius, 8);
    assert.equal(target.totalCollected, 7);
    assert.equal(target.sitesLooted, 2);
    assert.deepEqual(target.run, { perk: 'hot', curse: 'thick', depth: 2, rewarded: false });

    delete save.globalGameState;
    localStorage.setItem(storageKey, JSON.stringify(save));
    target.drones[0].alive = false;
    target.activeDrone = null;
    target.resources = 17;
    WorldManager.loadFromStorage(target);
    assert.deepEqual(target.drones, createDroneSquad());
    assert.equal(target.activeDrone, 'D1');
    assert.equal(target.resources, 0);
    assert.equal(target.time, 0);
    assert.equal(target.runActive, true);
    assert.deepEqual(target.run, { perk: null, curse: null, depth: 0, rewarded: false });
});

test('invalid active IDs choose a survivor and explicitly dead or empty rosters stay dead', () => {
    setupInstance();
    WorldManager.saveToStorage(state);
    const save = JSON.parse(localStorage.getItem(storageKey));
    save.globalGameState.drones[0].alive = false;
    save.globalGameState.activeDrone = 'D1';
    localStorage.setItem(storageKey, JSON.stringify(save));
    const target = {};
    WorldManager.loadFromStorage(target);
    assert.equal(target.activeDrone, 'D2');
    assert.equal(target.drones[0].alive, false);
    assert.equal(target.runActive, true);
    for (const roster of [[], save.globalGameState.drones.map(d => ({ ...d, alive: false }))]) {
        save.globalGameState.drones = roster;
        localStorage.setItem(storageKey, JSON.stringify(save));
        WorldManager.loadFromStorage(target);
        assert.equal(target.activeDrone, null);
        assert.equal(target.runActive, false);
        assert.equal(target.lossReason, 'squad');
        assert.ok(target.drones.every(d => !d.alive));
    }
});

test('drone loss restores doors and airlock, drops only transit cargo, and saves the entire live run', () => {
    const loc = setupInstance();
    const creatures = state.creatures;
    const airlocks = state.airlocks;
    assert.equal(loseActiveDrone('TEST'), true);
    assert.deepEqual(state.drones.map(d => d.alive), [false, true, true]);
    assert.equal(state.activeDrone, 'D2');
    assert.deepEqual(state.probe, { x: 1, y: 1, facing: 'd' });
    assert.deepEqual(state.pathStack, [{ x: 1, y: 1, c: 'H' }]);
    assert.deepEqual(state.map[1], [...'#HA+....#']);
    assert.equal(state.movingCargo.length, 0);
    assert.deepEqual(state.scanPings, []);
    assert.equal(state.threatClock, 0);
    assert.equal(state.evacConfirm, false);
    assert.equal(state.upgradeConfirm, false);
    assert.equal(state.speedConfirm, false);
    assert.strictEqual(state.creatures, creatures);
    assert.strictEqual(loc.creatures, creatures);
    assert.strictEqual(state.airlocks, airlocks);
    assert.strictEqual(loc.savedMap, state.map);
    assert.equal(state.resources, 3);
    assert.equal(state.totalCollected, 7);
    assert.equal(state.sitesLooted, 2);
    assert.equal(state.tetherMax, 41);
    assert.equal(state.transportSpeed, 2);
    assert.equal(state.worldViewRadius, 8);
    assert.equal(state.runActive, true);
    assert.equal(meta.runs, 0);
    const saved = JSON.parse(localStorage.getItem(storageKey));
    assert.deepEqual(saved.instances['5,5'].savedMap, state.map);
    assert.deepEqual(saved.instances['5,5'].creatures, creatures);
    assert.equal(saved.globalGameState.activeDrone, 'D2');
    assert.equal(saved.globalGameState.drones[0].alive, false);
    assert.equal(saved.globalGameState.time, 110);
    assert.equal(saved.globalGameState.totalCollected, 7);
    assert.deepEqual(saved.globalGameState.run, state.run);
});

test('losing the final drone ends and rewards the run once and removes the save', () => {
    setupInstance();
    state.drones[0].alive = false;
    state.drones[1].alive = false;
    state.activeDrone = 'D3';
    WorldManager.saveToStorage(state);
    assert.equal(loseActiveDrone('TEST'), true);
    assert.equal(state.activeDrone, null);
    assert.ok(state.drones.every(drone => !drone.alive));
    assert.equal(state.overlay, 'LOSE');
    assert.equal(state.lossReason, 'squad');
    assert.equal(state.runActive, false);
    assert.equal(state.run.rewarded, true);
    assert.equal(state.lastReward, 11);
    assert.equal(meta.data, 11);
    assert.equal(meta.runs, 1);
    assert.equal(meta.wins, 0);
    assert.equal(localStorage.getItem(storageKey), null);
    assert.equal(loseActiveDrone('TEST AGAIN'), false);
    assert.equal(meta.runs, 1);
    assert.equal(localStorage.getItem(storageKey), null);
});

test('the base repels an attacker before deploying the replacement', () => {
    const loc = setupInstance();
    state.map = [[...'#########'], [...'#H......#'], [...'#########']];
    loc.savedMap = state.map;
    state.probe = { x: 1, y: 1, facing: 'd' };
    state.pathStack = [{ x: 1, y: 1, c: 'H' }];
    loc.creatures[0].x = 1;
    loc.creatures[0].y = 1;
    assert.equal(loseActiveDrone('CREATURE ATTACK'), true);
    assert.equal(state.activeDrone, 'D2');
    assert.ok(loc.creatures[0].x >= 4);
    assert.equal(advanceTime(1), false);
    assert.equal(advanceTime(1), false);
    assert.equal(state.drones[1].alive, true);
    const saved = JSON.parse(localStorage.getItem(storageKey));
    assert.equal(saved.instances['5,5'].creatures[0].x >= 4, true);
});

test('threat steps accumulate per two instance time units, pings expire, and world/skip time is safe', () => {
    const loc = setupInstance();
    state.map = [[...'#########'], [...'#H......#'], [...'#########']];
    loc.savedMap = state.map;
    state.pathStack = [{ x: 1, y: 1, c: 'H' }];
    state.probe = { x: 1, y: 1, facing: 'd' };
    state.movingCargo = [];
    state.threatClock = 0;
    state.scanPings = [{ x: 7, y: 1, expiresAt: 112 }, { x: 6, y: 1, expiresAt: 113 }];
    assert.equal(advanceTime(1), false);
    assert.equal(loc.creatures[0].x, 7);
    assert.equal(state.threatClock, 1);
    assert.equal(advanceTime(1), false);
    assert.equal(loc.creatures[0].x, 6);
    assert.equal(state.threatClock, 0);
    assert.deepEqual(state.scanPings, [{ x: 6, y: 1, expiresAt: 113 }]);
    assert.equal(advanceTime(1, { skipThreats: true }), false);
    assert.equal(loc.creatures[0].x, 6);
    assert.equal(state.threatClock, 0);
    assert.deepEqual(state.scanPings, []);
    state.mode = 'WORLD';
    assert.equal(advanceTime(10), false);
    assert.equal(loc.creatures[0].x, 6);
    assert.equal(state.threatClock, 0);
});

test('direct contact kills even without a movement tick and movement contact also kills', () => {
    let loc = setupInstance();
    state.threatClock = 0;
    loc.creatures[0].x = state.probe.x;
    assert.equal(advanceTime(0), true);
    assert.equal(state.activeDrone, 'D2');
    assert.equal(state.drones[0].alive, false);
    assert.strictEqual(state.creatures, loc.creatures);

    // The creature advances on a completed two-unit tick and reaches the probe.
    state.map = [[...'#####'], [...'#H..#'], [...'#####']];
    state.pathStack = [{ x: 1, y: 1, c: 'H' }];
    state.probe = { x: 1, y: 1, facing: 'd' };
    loc.creatures[0].x = 2;
    loc.creatures[0].y = 1;
    assert.equal(advanceTime(2), true);
    assert.equal(state.activeDrone, 'D3');
    assert.equal(state.drones[1].alive, false);
});

test('live cargo collection and upgraded multi-interval fog still apply before threats', () => {
    setupInstance();
    state.creatures.length = 0;
    state.run.curse = 'thick';
    meta.levels.shield = 2;
    state.time = 0;
    state.worldViewRadius = 10;
    state.lastFogReductionTime = 0;
    state.movingCargo = [{ pathIndex: 4 }, { pathIndex: 1000 }];
    const interval = rules.fogInterval();
    assert.equal(advanceTime(interval * 3), false);
    assert.equal(state.worldViewRadius, 7);
    assert.equal(state.lastFogReductionTime, interval * 3);
    assert.equal(state.resources, 5);
    assert.equal(state.totalCollected, 9);
    assert.deepEqual(state.movingCargo, []);
});

test('signal deadline wins priority, rewards once, and later loss cannot recreate the save', () => {
    setupInstance();
    WorldManager.saveToStorage(state);
    state.time = rules.deadline() - 1;
    state.creatures[0].x = state.probe.x;
    const cargo = structuredClone(state.movingCargo);
    assert.equal(advanceTime(1, { skipThreats: true }), true);
    assert.equal(state.overlay, 'LOSE');
    assert.equal(state.lossReason, 'signal');
    assert.equal(state.runActive, false);
    assert.deepEqual(state.movingCargo, cargo); // original deadline order
    assert.equal(meta.data, 11);
    assert.equal(meta.runs, 1);
    assert.equal(localStorage.getItem(storageKey), null);
    assert.equal(loseActiveDrone('AIRLOCK VENT'), false);
    assert.equal(state.lossReason, 'signal');
    assert.equal(meta.runs, 1);
    assert.equal(localStorage.getItem(storageKey), null);
});
