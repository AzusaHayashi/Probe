// Threats are deliberately independent of rendering, time advancement and drone
// rosters. Coordinates are grid coordinates; all movement is cardinal.
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const motionMemory = new WeakMap();

const key = (x, y) => `${x},${y}`;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function resetMotionMemory(state) {
    motionMemory.delete(state);
}

function validPosition(pos) {
    return pos && Number.isInteger(pos.x) && Number.isInteger(pos.y);
}

function walkable(map, x, y) {
    const tile = map?.[y]?.[x];
    return typeof tile === 'string' && tile !== '#' && tile !== '+';
}

// One reverse BFS can be shared by all creatures while the map and probe stay
// unchanged. Distances also establish which cells are reachable at placement.
function distancesFrom(map, origin) {
    const distances = new Map();
    if (!validPosition(origin) || !walkable(map, origin.x, origin.y)) return distances;

    const queue = [{ x: origin.x, y: origin.y }];
    distances.set(key(origin.x, origin.y), 0);
    for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        const distance = distances.get(key(current.x, current.y));
        for (const [dx, dy] of DIRECTIONS) {
            const x = current.x + dx;
            const y = current.y + dy;
            const cell = key(x, y);
            if (walkable(map, x, y) && !distances.has(cell)) {
                distances.set(cell, distance + 1);
                queue.push({ x, y });
            }
        }
    }
    return distances;
}

// Emergency base defenses push an attacker away before a replacement deploys.
// Prefer nearby reachable tiles at least three steps away, so a replacement is
// never placed directly on the creature that destroyed its predecessor.
export function secureDeploymentPoint(state) {
    if (!validPosition(state.probe) || !Array.isArray(state.creatures)) return;
    const distances = distancesFrom(state.map, state.probe);
    for (let i = state.creatures.length - 1; i >= 0; i--) {
        const creature = state.creatures[i];
        if (creature.x !== state.probe.x || creature.y !== state.probe.y) continue;
        const occupied = new Set(state.creatures.filter((_, j) => j !== i).map(c => key(c.x, c.y)));
        const candidates = [...distances.entries()].map(([cell, distance]) => {
            const [x, y] = cell.split(',').map(Number);
            return { x, y, distance };
        }).filter(cell => cell.distance > 0 && !occupied.has(key(cell.x, cell.y)))
            .sort((a, b) => a.distance - b.distance);
        let destination = candidates.find(cell => cell.distance >= 3) || candidates[0];
        if (!destination) {
            // A tiny sealed room may have no reachable space. Repel through the
            // bulkhead if there is any free traversable cell elsewhere.
            for (let y = 0; y < state.map.length && !destination; y++) {
                for (let x = 0; x < state.map[y].length; x++) {
                    if ((x !== state.probe.x || y !== state.probe.y) && walkable(state.map, x, y)
                        && !occupied.has(key(x, y))) { destination = { x, y }; break; }
                }
            }
        }
        if (destination) {
            creature.x = destination.x;
            creature.y = destination.y;
        } else {
            // Degenerate one-tile maps cannot safely hold both; expel it.
            state.creatures.splice(i, 1);
        }
    }
}

// Hash the seed instead of relying on JS's global, nondeterministic Math.random.
function seededRandom(seed) {
    let hash = 2166136261;
    for (const char of String(seed ?? 0)) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    }
    return () => {
        hash = (hash + 0x6d2b79f5) | 0;
        let n = Math.imul(hash ^ (hash >>> 15), 1 | hash);
        n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
        return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

/**
 * Attach location-owned arrays and initialize missing threat data exactly once.
 * `start` accepts {x,y}, and also a generated start room's {cx,cy}.
 * Only reachable '.' cells can be turned into airlocks or receive new enemies;
 * when space is limited an airlock takes priority and fewer enemies may spawn.
 */
export function initializeThreats(state, loc, start, type) {
    const hadCreatures = Array.isArray(loc.creatures);
    if (!hadCreatures) loc.creatures = [];
    if (!Array.isArray(loc.airlocks)) loc.airlocks = [];
    state.creatures = loc.creatures;
    state.airlocks = loc.airlocks;
    motionMemory.delete(state);

    // Workshops are safe even if stale threat arrays happen to have been saved.
    if ((type ?? loc.type) === 'W') {
        loc.creatures.length = 0;
        loc.airlocks.length = 0;
        return;
    }

    const origin = validPosition(start) ? start
        : Number.isInteger(start?.cx) && Number.isInteger(start?.cy)
            ? { x: start.cx, y: start.cy }
            : state.probe;
    const map = state.map;
    const distances = distancesFrom(map, origin);
    const random = seededRandom(loc.seed);
    const airlockKeys = new Set(loc.airlocks.filter(validPosition).map(a => key(a.x, a.y)));
    const creatureKeys = new Set(loc.creatures.filter(validPosition).map(c => key(c.x, c.y)));
    // Open doors can be represented as '.'; metadata still makes them special.
    const doorKeys = new Set(Object.keys(loc.doors ?? {}));
    const available = [];
    let hasReachableAirlock = false;

    // A legacy save may retain coordinates but have lost the map marker. Only
    // restore it on unoccupied plain floor, never on a home or special tile.
    for (const airlock of loc.airlocks) {
        if (!validPosition(airlock)) continue;
        const cell = key(airlock.x, airlock.y);
        if (!distances.has(cell)) continue;
        const tile = map[airlock.y][airlock.x];
        if (tile === 'A' || tile === '-' || tile === '|') {
            hasReachableAirlock = true;
        } else if (tile === '.' && distances.get(cell) > 0 && !creatureKeys.has(cell)
            && !doorKeys.has(cell)
            && !(state.probe?.x === airlock.x && state.probe?.y === airlock.y)) {
            map[airlock.y][airlock.x] = 'A';
            hasReachableAirlock = true;
        }
    }

    // Recover existing reachable 'A' tiles from older saves lacking metadata.
    // Never replace a special tile, including pipes that may cover an airlock.
    for (let y = 0; y < (map?.length ?? 0); y++) {
        for (let x = 0; x < (map[y]?.length ?? 0); x++) {
            const cell = key(x, y);
            if (!distances.has(cell)) continue;
            if (map[y][x] === 'A') {
                hasReachableAirlock = true;
                if (!airlockKeys.has(cell)) {
                    loc.airlocks.push({ x, y });
                    airlockKeys.add(cell);
                }
            } else if (map[y][x] === '.' && distances.get(cell) > 0
                && !(state.probe?.x === x && state.probe?.y === y)
                && !airlockKeys.has(cell) && !creatureKeys.has(cell) && !doorKeys.has(cell)) {
                available.push({ x, y, distance: distances.get(cell) });
            }
        }
    }

    shuffle(available, random);
    if (!hasReachableAirlock && available.length) {
        // Prefer a reachable airlock a few steps from the entrance.
        const nearby = available.findIndex(cell => cell.distance >= 2 && cell.distance <= 6);
        const [cell] = available.splice(nearby < 0 ? 0 : nearby, 1);
        map[cell.y][cell.x] = 'A';
        loc.airlocks.push({ x: cell.x, y: cell.y });
    }

    // An existing empty array is intentional: a cleared instance stays clear.
    if (!hadCreatures) {
        const target = 2 + Math.floor(random() * 2);
        // Stable sort retains the seeded tie order; farthest available cells are
        // preferred, with progressively nearer cells as a small-map fallback.
        available.sort((a, b) => b.distance - a.distance);
        for (const cell of available.slice(0, target)) {
            loc.creatures.push({ id: `creature-${loc.creatures.length + 1}`, x: cell.x, y: cell.y });
        }
    }
}

/** Move once per whole time unit, returning as soon as a creature catches the probe. */
export function advanceThreats(state, amount) {
    const noAttack = { attacked: false, attackerId: null };
    const steps = Number.isFinite(amount) ? Math.floor(amount) : 0;
    const creatures = state.creatures;
    if (state.mode !== 'INSTANCE' || steps <= 0 || !validPosition(state.probe)
        || !Array.isArray(creatures) || creatures.length === 0) return noAttack;

    const probe = state.probe;
    const distances = distancesFrom(state.map, probe);
    const occupied = new Map();
    for (const creature of creatures) {
        if (!validPosition(creature)) continue;
        const cell = key(creature.x, creature.y);
        occupied.set(cell, (occupied.get(cell) ?? 0) + 1);
    }

    for (let step = 0; step < steps; step++) {
        for (const creature of creatures) {
            if (validPosition(creature) && creature.x === probe.x && creature.y === probe.y) {
                return { attacked: true, attackerId: creature.id };
            }
        }

        let moved = false;
        for (const creature of creatures) {
            if (!validPosition(creature)) continue;
            const currentKey = key(creature.x, creature.y);
            const distance = distances.get(currentKey);
            if (distance === undefined) continue;

            for (const [dx, dy] of DIRECTIONS) {
                const x = creature.x + dx;
                const y = creature.y + dy;
                const destination = key(x, y);
                if (distances.get(destination) !== distance - 1 || occupied.has(destination)) continue;
                const remaining = occupied.get(currentKey) - 1;
                if (remaining) occupied.set(currentKey, remaining);
                else occupied.delete(currentKey);
                creature.x = x;
                creature.y = y;
                occupied.set(destination, (occupied.get(destination) ?? 0) + 1);
                moved = true;
                if (x === probe.x && y === probe.y) {
                    return { attacked: true, attackerId: creature.id };
                }
                break;
            }
        }
        // With a fixed map and probe, nobody can make progress in later ticks.
        if (!moved) break;
    }
    return noAttack;
}

/**
 * Detect by Manhattan distance, without line-of-sight checks. `count` is the
 * number detected on this scan; pings also include unexpired last sightings.
 * A ping expires at time >= expiresAt and remains private to this state/session.
 */
export function scanForMotion(state) {
    let memory = motionMemory.get(state);
    if (!memory) {
        memory = new Map();
        motionMemory.set(state, memory);
    }
    const now = Number.isFinite(state.time) ? state.time : 0;
    for (const [creature, ping] of memory) {
        if (now >= ping.expiresAt) memory.delete(creature);
    }

    let count = 0;
    if (validPosition(state.probe) && Array.isArray(state.creatures)) {
        for (const creature of state.creatures) {
            if (validPosition(creature) && manhattan(state.probe, creature) <= 10) {
                memory.set(creature, { x: creature.x, y: creature.y, expiresAt: now + 4 });
                count++;
            }
        }
    }
    return { pings: Array.from(memory.values(), ping => ({ ...ping })), count };
}

/** Vent the closest airlock within six Manhattan tiles; ties use array order. */
export function ventAirlock(state) {
    let airlock = null;
    let closest = Infinity;
    if (validPosition(state.probe) && Array.isArray(state.airlocks)) {
        for (const candidate of state.airlocks) {
            if (!validPosition(candidate)) continue;
            const distance = manhattan(state.probe, candidate);
            if (distance <= 6 && distance < closest) {
                airlock = candidate;
                closest = distance;
            }
        }
    }
    if (!airlock) return { activated: false, killed: 0, droneInDanger: false, airlock: null };

    let killed = 0;
    const creatures = state.creatures;
    if (Array.isArray(creatures)) {
        let write = 0;
        for (const creature of creatures) {
            if (validPosition(creature) && chebyshev(creature, airlock) <= 1) {
                killed++;
            } else {
                creatures[write++] = creature;
            }
        }
        creatures.length = write;
    }
    return { activated: true, killed, droneInDanger: chebyshev(state.probe, airlock) <= 1, airlock };
}
