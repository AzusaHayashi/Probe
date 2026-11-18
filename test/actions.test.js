import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
};
const log = { style: {}, innerText: '' };
globalThis.document = { getElementById: id => id === 'log' ? log : null };

const { state, createDroneSquad, loseActiveDrone } = await import('../src/gameState.js');
const { WorldManager } = await import('../src/worldManager.js');
const { executeAction, moveInInstance, handleVent } = await import('../src/actions.js');

function fixture() {
    storage.clear();
    const map = [
        '#########'.split(''),
        '#H.+....#'.split(''),
        '#########'.split('')
    ];
    const loc = {
        type: 'F', seed: 42, savedMap: map,
        doors: { '3,1': false }, cargoSeen: new Set(),
        cargoGone: new Set(), revealedPoints: new Set(),
        creatures: [{ id: 'C1', x: 6, y: 1 }], airlocks: []
    };
    WorldManager.state = {
        globalSeed: 42, overworld: [['F']], instances: { '0,0': loc },
        playerPos: { x: 0, y: 0 }, explored: new Set(), revealedTiles: {}
    };
    Object.assign(state, {
        mode: 'INSTANCE', overlay: null, currentInstanceKey: '0,0', map,
        run: { perk: null, curse: null, depth: 0, rewarded: false }, runActive: true,
        worldPos: { x: 0, y: 0 }, probe: { x: 2, y: 1, facing: 'd' },
        pathStack: [{ x: 1, y: 1, c: 'H' }, { x: 2, y: 1, c: '.' }],
        creatures: loc.creatures, airlocks: loc.airlocks,
        drones: createDroneSquad(), activeDrone: 'D1', scanPings: [], threatClock: 0,
        movingCargo: [], resources: 0, totalCollected: 0, sitesLooted: 0,
        time: 0, tetherMax: 35, transportSpeed: 1,
        lastFogReductionTime: 0, lastDecayCheck: 0, worldViewRadius: 10
    });
    return loc;
}

test('bulkheads open and seal, blocking pursuit without breaking the tether', () => {
    const loc = fixture();
    executeAction();
    assert.equal(loc.doors['3,1'], true);
    assert.equal(state.map[1][3], '.');
    executeAction();
    assert.equal(loc.doors['3,1'], false);
    assert.equal(state.map[1][3], '+');
    assert.ok(state.creatures[0].x >= 4);
    assert.equal(state.drones[0].alive, true);
});

test('a sealed door blocks the drone retracting through its tether', () => {
    fixture();
    state.pathStack.push({ x: 3, y: 1, c: '.' }, { x: 4, y: 1, c: '.' });
    state.probe = { x: 4, y: 1, facing: 'd' };
    state.creatures.length = 0;
    moveInInstance('a');
    assert.equal(state.probe.x, 4);
    assert.equal(state.map[1][3], '+');
    assert.equal(state.probe.facing, 'a');
    executeAction();
    assert.notEqual(state.map[1][3], '+');
});

test('an open rear door can be targeted without retracting through it', () => {
    const loc = fixture();
    state.creatures.length = 0;
    state.map[1][3] = '-';
    state.map[1][5] = '+';
    loc.doors = { '3,1': true, '5,1': false };
    state.pathStack.push({ x: 3, y: 1, c: '.' }, { x: 4, y: 1, c: '.' });
    state.probe = { x: 4, y: 1, facing: 'd' };
    moveInInstance('a');
    assert.equal(state.probe.x, 4);
    assert.equal(state.probe.facing, 'a');
    executeAction();
    assert.equal(loc.doors['3,1'], false);
    assert.equal(loc.doors['5,1'], false);
});

test('loss clears the severed tether, deploys a replacement, and survives reload', () => {
    fixture();
    state.map[1][2] = '-';
    state.totalCollected = 7;
    state.run.perk = 'lucky';
    loseActiveDrone('TEST');
    assert.equal(state.drones[0].alive, false);
    assert.equal(state.activeDrone, 'D2');
    assert.equal(state.probe.x, 1);
    assert.equal(state.map[1][2], '.');
    const restored = { drones: createDroneSquad(), activeDrone: 'D1' };
    assert.equal(WorldManager.loadFromStorage(restored), true);
    assert.deepEqual(restored.drones.map(drone => drone.alive), [false, true, true]);
    assert.equal(restored.activeDrone, 'D2');
    assert.equal(restored.totalCollected, 7);
    assert.equal(restored.run.perk, 'lucky');
});

test('venting the chamber while inside destroys the active drone', () => {
    const loc = fixture();
    state.creatures.length = 0;
    loc.airlocks.push({ x: 3, y: 1 });
    handleVent();
    assert.equal(state.drones[0].alive, false);
    assert.equal(state.activeDrone, 'D2');
});

test('the last lost drone ends the run and cannot be resumed from its save', () => {
    fixture();
    WorldManager.saveToStorage(state);
    state.drones[0].alive = false;
    state.drones[1].alive = false;
    state.activeDrone = 'D3';
    loseActiveDrone('TEST');
    assert.equal(state.runActive, false);
    assert.equal(state.overlay, 'LOSE');
    assert.equal(state.lossReason, 'squad');
    assert.equal(storage.has('scavenge_world_data'), false);
});
