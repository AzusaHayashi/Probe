import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const screen = { innerHTML: '', querySelector: () => null };
const length = { innerText: '' };
globalThis.document = { getElementById: id => id === 'game-screen' ? screen : id === 'val-len' ? length : null };
const { state } = await import('../src/gameState.js');
const { WorldManager } = await import('../src/worldManager.js');
const { renderInstance } = await import('../src/renderer.js');
const { isVisible } = await import('../src/visibility.js');

test('last-known scan ping remains visible when its now-empty tile is in sight', () => {
    state.mode = 'INSTANCE';
    state.currentInstanceKey = '5,5';
    state.map = ['#####', '#...#', '#.H.#', '#...#', '#####'].map(s => [...s]);
    state.probe = { x: 2, y: 2, facing: 'w' };
    state.pathStack = [{ x: 2, y: 2, c: 'H' }];
    state.movingCargo = [];
    state.creatures = [];
    state.airlocks = [];
    state.time = 1;
    state.scanPings = [{ x: 2, y: 1, expiresAt: 4 }];
    WorldManager.state.instances['5,5'] = { revealedPoints: new Set(), cargoSeen: new Set() };
    assert.equal(isVisible(2, 1, state.probe, state.map), true);
    renderInstance();
    assert.match(screen.innerHTML, /class="scan-ping">\?/);
});
