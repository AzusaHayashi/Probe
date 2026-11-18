import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../src/mapGen.js';
import { initializeThreats, advanceThreats, scanForMotion, ventAirlock, resetMotionMemory } from '../src/threats.js';

const tiles = (...rows) => rows.map(row => [...row]);
const copy = value => JSON.parse(JSON.stringify(value));
const makeState = (map, probe = { x: 1, y: 1 }) => ({
    map, probe, time: 0, mode: 'INSTANCE', creatures: [], airlocks: [],
    drones: [{ id: 'drone-1', status: 'ready' }]
});

const spawnMap = () => tiles(
    '############',
    '#H....O....#',
    '#.....+....#',
    '#...T.|....#',
    '#....-...S.#',
    '############'
);

test('initialization is seeded, uses only reachable plain floor and preserves features', () => {
    const before = spawnMap();
    const state = makeState(copy(before));
    const loc = { seed: 763, type: 'F' };
    initializeThreats(state, loc, { x: 1, y: 1 }, 'F');

    assert.strictEqual(state.creatures, loc.creatures);
    assert.strictEqual(state.airlocks, loc.airlocks);
    assert.ok(loc.creatures.length >= 2 && loc.creatures.length <= 3);
    assert.equal(loc.airlocks.length, 1);
    assert.equal(state.map[loc.airlocks[0].y][loc.airlocks[0].x], 'A');
    assert.equal(before[loc.airlocks[0].y][loc.airlocks[0].x], '.');
    assert.equal(new Set(loc.creatures.map(c => `${c.x},${c.y}`)).size, loc.creatures.length);
    for (const creature of loc.creatures) {
        assert.equal(before[creature.y][creature.x], '.');
        assert.equal(state.map[creature.y][creature.x], '.');
        assert.ok(Math.abs(creature.x - 1) + Math.abs(creature.y - 1) >= 5);
        assert.ok(creature.id);
    }
    for (let y = 0; y < before.length; y++) {
        for (let x = 0; x < before[y].length; x++) {
            if (before[y][x] !== '.') assert.equal(state.map[y][x], before[y][x]);
        }
    }

    const same = makeState(copy(before));
    const sameLoc = { seed: 763, type: 'F' };
    initializeThreats(same, sameLoc, { cx: 1, cy: 1 }, 'F');
    assert.deepEqual(sameLoc.creatures, loc.creatures);
    assert.deepEqual(sameLoc.airlocks, loc.airlocks);
    assert.deepEqual(same.map, state.map);
});

test('disconnected rooms and closed doors never receive newly placed threats', () => {
    const map = tiles(
        '###########',
        '#H..+.....#',
        '#...#######',
        '###########'
    );
    const state = makeState(map);
    const loc = { seed: 99 };
    initializeThreats(state, loc, state.probe, 'S');
    assert.equal(loc.airlocks.length, 1);
    assert.ok(loc.creatures.length >= 2);
    for (const item of [...loc.airlocks, ...loc.creatures]) {
        assert.ok(item.x <= 3 && item.y <= 2);
    }
    assert.deepEqual(map[1].slice(4), [...'+.....#']);
});

test('limited or absent reachable floor never causes unsafe placement or a loop', () => {
    const map = tiles('#####', '#H+.#', '#####');
    const state = makeState(map);
    const loc = { seed: 1 };
    initializeThreats(state, loc, state.probe, 'F');
    assert.deepEqual(loc.creatures, []);
    assert.deepEqual(loc.airlocks, []);
    assert.deepEqual(map, tiles('#####', '#H+.#', '#####'));

    const little = makeState(tiles('#####', '#H..#', '#####'));
    const littleLoc = { seed: 1 };
    initializeThreats(little, littleLoc, little.probe, 'F');
    assert.equal(littleLoc.airlocks.length, 1);
    assert.equal(littleLoc.creatures.length, 1);
});

test('saved open-door metadata protects floor-looking door tiles from placement', () => {
    const map = tiles('#####', '#H.O#', '#####');
    const state = makeState(map);
    const loc = { seed: 2, doors: { '2,1': true } };
    initializeThreats(state, loc, state.probe, 'F');
    assert.deepEqual(loc.creatures, []);
    assert.deepEqual(loc.airlocks, []);
    assert.deepEqual(map, tiles('#####', '#H.O#', '#####'));
});

test('revisits and serialized reloads retain array contents and do not respawn cleared creatures', () => {
    const state = makeState(spawnMap());
    const loc = { seed: 41 };
    initializeThreats(state, loc, state.probe, 'F');
    const creatureArray = loc.creatures;
    const airlockArray = loc.airlocks;
    const placedAirlocks = copy(loc.airlocks);
    const placedMap = copy(state.map);
    initializeThreats(state, loc, state.probe, 'F');
    assert.strictEqual(state.creatures, creatureArray);
    assert.strictEqual(state.airlocks, airlockArray);
    assert.deepEqual(loc.airlocks, placedAirlocks);
    assert.deepEqual(state.map, placedMap);

    creatureArray.length = 0;
    initializeThreats(state, loc, state.probe, 'F');
    assert.strictEqual(state.creatures, creatureArray);
    assert.equal(state.creatures.length, 0);
    assert.deepEqual(state.airlocks, placedAirlocks);

    const restoredLoc = copy(loc);
    const restored = makeState(copy(state.map));
    initializeThreats(restored, restoredLoc, restored.probe, 'F');
    assert.strictEqual(restored.creatures, restoredLoc.creatures);
    assert.strictEqual(restored.airlocks, restoredLoc.airlocks);
    assert.deepEqual(restored.creatures, []);
    assert.deepEqual(restored.airlocks, placedAirlocks);
    assert.deepEqual(restored.map, state.map);
});

test('old saves get airlocks in place, and existing A tiles are recovered without duplication', () => {
    const state = makeState(tiles('##########', '#H.A.O...#', '##########'));
    const oldEmpty = [];
    const loc = { seed: 12, creatures: oldEmpty };
    initializeThreats(state, loc, state.probe, 'F');
    assert.strictEqual(state.creatures, oldEmpty);
    assert.deepEqual(state.creatures, []);
    assert.deepEqual(state.airlocks, [{ x: 3, y: 1 }]);
    initializeThreats(state, loc, state.probe, 'F');
    assert.deepEqual(state.airlocks, [{ x: 3, y: 1 }]);

    const oldAirlocks = [];
    const second = makeState(spawnMap());
    const secondLoc = { seed: 12, airlocks: oldAirlocks };
    initializeThreats(second, secondLoc, second.probe, 'F');
    assert.strictEqual(second.airlocks, oldAirlocks);
    assert.equal(oldAirlocks.length, 1);
});

test('an existing airlock hidden by a pipe is retained without overwriting it', () => {
    const state = makeState(tiles('########', '#H.-...#', '########'));
    const airlocks = [{ x: 3, y: 1 }];
    const creatures = [];
    const loc = { seed: 33, airlocks, creatures };
    initializeThreats(state, loc, state.probe, 'F');
    assert.strictEqual(state.airlocks, airlocks);
    assert.deepEqual(airlocks, [{ x: 3, y: 1 }]);
    assert.equal(state.map[1][3], '-');
});

test('legacy airlock coordinates restore missing floor markers without replacing features', () => {
    const restored = makeState(tiles('########', '#H.....#', '########'));
    const original = [{ x: 3, y: 1 }];
    const loc = { seed: 7, creatures: [], airlocks: original };
    initializeThreats(restored, loc, restored.probe, 'F');
    assert.strictEqual(restored.airlocks, original);
    assert.deepEqual(original, [{ x: 3, y: 1 }]);
    assert.equal(restored.map[1][3], 'A');

    const protectedTile = makeState(tiles('########', '#HT....#', '########'));
    const stale = [{ x: 2, y: 1 }];
    const staleLoc = { seed: 7, creatures: [], airlocks: stale };
    initializeThreats(protectedTile, staleLoc, protectedTile.probe, 'F');
    assert.strictEqual(protectedTile.airlocks, stale);
    assert.equal(protectedTile.map[1][2], 'T');
    assert.equal(stale.length, 2);
    assert.equal(protectedTile.map[stale[1].y][stale[1].x], 'A');
});

test('workshops have no enemies or airlocks, retaining the location array identities', () => {
    const state = makeState(tiles('#####', '#H..#', '#####'));
    const before = copy(state.map);
    const loc = { seed: 1, type: 'W', creatures: [{ id: 'stale', x: 2, y: 1 }], airlocks: [{ x: 3, y: 1 }] };
    const creatures = loc.creatures;
    const airlocks = loc.airlocks;
    initializeThreats(state, loc, state.probe, 'W');
    assert.strictEqual(state.creatures, creatures);
    assert.strictEqual(state.airlocks, airlocks);
    assert.deepEqual(creatures, []);
    assert.deepEqual(airlocks, []);
    assert.deepEqual(state.map, before);
});

test('generated dungeons support reachable threat placement for multiple seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const generated = generateDungeon(seed);
        const start = { x: generated.startRoom.cx, y: generated.startRoom.cy };
        generated.map[start.y][start.x] = 'H';
        const state = makeState(generated.map, start);
        const loc = { seed };
        initializeThreats(state, loc, start, 'F');
        assert.ok(loc.creatures.length >= 2 && loc.creatures.length <= 3, `seed ${seed}`);
        assert.equal(loc.airlocks.length, 1, `seed ${seed}`);
        assert.equal(state.map[loc.airlocks[0].y][loc.airlocks[0].x], 'A');
    }
});

test('BFS takes a detour around walls and stops immediately on contact', () => {
    const state = makeState(tiles(
        '#########',
        '#H..#...#',
        '#...#...#',
        '#.......#',
        '#########'
    ));
    state.creatures = [{ id: 'c1', x: 7, y: 1 }];
    const beforeDrones = copy(state.drones);
    assert.deepEqual(advanceThreats(state, 1), { attacked: false, attackerId: null });
    assert.deepEqual(state.creatures[0], { id: 'c1', x: 7, y: 2 });
    assert.deepEqual(advanceThreats(state, 100), { attacked: true, attackerId: 'c1' });
    assert.deepEqual(state.creatures[0], { id: 'c1', x: 1, y: 1 });
    assert.deepEqual(state.drones, beforeDrones);
    assert.equal(state.time, 0);
});

test('closed doors stop pursuit until opened; pipes and airlocks are walkable', () => {
    const state = makeState(tiles('#######', '#H+...#', '#######'));
    state.creatures = [{ id: 'blocked', x: 5, y: 1 }];
    assert.deepEqual(advanceThreats(state, 1000000000), { attacked: false, attackerId: null });
    assert.equal(state.creatures[0].x, 5);
    state.map[1][2] = '.';
    assert.deepEqual(advanceThreats(state, 1), { attacked: false, attackerId: null });
    assert.equal(state.creatures[0].x, 4);

    const pipes = makeState(tiles('#######', '#H-|A.#', '#######'));
    pipes.creatures = [{ id: 'pipe-chaser', x: 5, y: 1 }];
    for (const expectedX of [4, 3, 2]) {
        assert.equal(advanceThreats(pipes, 1).attacked, false);
        assert.equal(pipes.creatures[0].x, expectedX);
    }
    assert.deepEqual(advanceThreats(pipes, 1), { attacked: true, attackerId: 'pipe-chaser' });
});

test('movement respects mode, whole ticks, occupancy and initial contact', () => {
    const state = makeState(tiles('#######', '#H....#', '#######'));
    state.creatures = [{ id: 'front', x: 3, y: 1 }, { id: 'back', x: 4, y: 1 }];
    state.mode = 'WORLD';
    advanceThreats(state, 4);
    assert.deepEqual(state.creatures.map(c => c.x), [3, 4]);
    state.mode = 'INSTANCE';
    advanceThreats(state, 0.9);
    assert.deepEqual(state.creatures.map(c => c.x), [3, 4]);
    advanceThreats(state, 1.9);
    assert.deepEqual(state.creatures.map(c => c.x), [2, 3]);
    assert.deepEqual(advanceThreats(state, 1), { attacked: true, attackerId: 'front' });
    assert.equal(state.creatures[1].x, 3);
    assert.deepEqual(advanceThreats(state, 1), { attacked: true, attackerId: 'front' });
});

test('motion scan uses a ten-tile Manhattan range and last-known pings expire after four units', () => {
    const state = makeState([], { x: 0, y: 0 });
    state.creatures = [{ id: 'near', x: 6, y: 4 }, { id: 'far', x: 11, y: 0 }];
    assert.deepEqual(scanForMotion(state), { pings: [{ x: 6, y: 4, expiresAt: 4 }], count: 1 });
    assert.equal(state.time, 0);
    state.creatures[0].x = 20;
    state.time = 3;
    assert.deepEqual(scanForMotion(state), { pings: [{ x: 6, y: 4, expiresAt: 4 }], count: 0 });
    state.time = 4;
    assert.deepEqual(scanForMotion(state), { pings: [], count: 0 });
});

test('rescanning refreshes a sighting and replaces its old position', () => {
    const state = makeState([], { x: 0, y: 0 });
    state.creatures = [{ id: 'c', x: 2, y: 2 }];
    scanForMotion(state);
    state.time = 2;
    state.creatures[0].x = 3;
    assert.deepEqual(scanForMotion(state), { pings: [{ x: 3, y: 2, expiresAt: 6 }], count: 1 });
    state.creatures.length = 0;
    state.time = 5;
    assert.deepEqual(scanForMotion(state), { pings: [{ x: 3, y: 2, expiresAt: 6 }], count: 0 });
    state.time = 6;
    assert.deepEqual(scanForMotion(state), { pings: [], count: 0 });
});

test('clearing scanner memory prevents stale contacts after a drone is lost', () => {
    const state = makeState([], { x: 0, y: 0 });
    state.creatures = [{ id: 'old', x: 2, y: 2 }];
    assert.equal(scanForMotion(state).count, 1);
    state.creatures.length = 0;
    resetMotionMemory(state);
    assert.deepEqual(scanForMotion(state), { pings: [], count: 0 });
});

test('vent selects the closest airlock and removes adjacent creatures in place', () => {
    const state = makeState([], { x: 1, y: 2 });
    const near = { x: 4, y: 2 };
    state.airlocks = [{ x: 6, y: 2 }, near, { x: 12, y: 2 }];
    const loc = { creatures: [
        { id: 'diagonal', x: 3, y: 1 },
        { id: 'adjacent', x: 4, y: 3 },
        { id: 'safe', x: 6, y: 2 }
    ] };
    state.creatures = loc.creatures;
    const roster = copy(state.drones);
    assert.deepEqual(ventAirlock(state), { activated: true, killed: 2, droneInDanger: false, airlock: near });
    assert.strictEqual(state.creatures, loc.creatures);
    assert.deepEqual(loc.creatures, [{ id: 'safe', x: 6, y: 2 }]);
    assert.equal(state.time, 0);
    assert.deepEqual(state.drones, roster);
});

test('vent reports danger, accepts range six, and handles no available airlock', () => {
    const state = makeState([], { x: 0, y: 0 });
    const atRange = { x: 6, y: 0 };
    state.airlocks = [atRange];
    assert.deepEqual(ventAirlock(state), { activated: true, killed: 0, droneInDanger: false, airlock: atRange });
    state.probe = { x: 5, y: 1 };
    assert.deepEqual(ventAirlock(state), { activated: true, killed: 0, droneInDanger: true, airlock: atRange });
    state.probe = { x: -1, y: 0 };
    assert.deepEqual(ventAirlock(state), { activated: false, killed: 0, droneInDanger: false, airlock: null });
});
