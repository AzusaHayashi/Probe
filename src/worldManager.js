import { generateDungeon } from './mapGen.js';

export const WorldManager = {
    state: {
        globalSeed: 888,
        overworld: [],       // 大世界 ASCII 地形
        instances: {},       // 记录已访问过的点位："x,y": { seed, savedMap, visited, type }
        playerPos: { x: 5, y: 5 }, // 玩家在大世界的位置
        currentMode: 'WORLD', // 'WORLD' 或 'INSTANCE'
        explored: new Set(), // 已探索过的坐标 Set
        revealedTiles: {},   // 坐标 -> { tile: 'F', 'S', 'M', 'W', 'E', 'I', visible: bool }
        cargoDecayChecked: new Set() // 已检测过衰减的资源包坐标 Set
    },

    // 初始化大世界
    init(seed) {
        this.state.globalSeed = seed;
        this.state.overworld = this.generateOverworld(seed);
        this.state.explored = new Set();
        this.state.revealedTiles = {};
        if (!this.loadFromStorage()) {
            this.saveToStorage();
        }
    },

    loadFromStorage(gameState = null) {
        const saved = localStorage.getItem('scavenge_world_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = parsed;
            this.state.explored = new Set(parsed.explored || []);
            // 恢复 instance 中的 Set
            for (let key in this.state.instances) {
                const loc = this.state.instances[key];
                if (loc.cargoSeen) loc.cargoSeen = new Set(loc.cargoSeen);
                if (loc.cargoGone) loc.cargoGone = new Set(loc.cargoGone);
                if (loc.revealedPoints) loc.revealedPoints = new Set(loc.revealedPoints);
            }

            // 如果提供了 gameState，恢复全局状态
            if (gameState && parsed.globalGameState) {
                const g = parsed.globalGameState;
                gameState.time = g.time ?? 0;
                gameState.resources = g.resources ?? 0;
                gameState.probeVisionBonus = g.probeVisionBonus ?? 0;
                gameState.tetherMax = g.tetherMax ?? 35;
                gameState.transportSpeed = g.transportSpeed ?? 1;
            }
            return true;
        }
        return false;
    },

    // 生成大世界地图 (50x50)
    generateOverworld(seed) {
        const rng = this.createRng(seed);
        const size = 50;
        let world = Array(size).fill().map(() => Array(size).fill('.'));

        // 随机撒布“探索点”：F=工厂，S=超市，E=撤离点，W=工坊
        for(let i=0; i<30; i++) {
            let rx = Math.floor(rng() * size);
            let ry = Math.floor(rng() * size);
            if (world[ry][rx] !== '.') continue;

            const types = ['F', 'S', 'M', 'W'];
            world[ry][rx] = types[Math.floor(rng() * types.length)];
            
            // 预设这个点的地牢种子
            this.state.instances[`${rx},${ry}`] = {
                seed: Math.floor(rng() * 100000),
                savedMap: null, // 初始为空
                visited: false,
                type: world[ry][rx]
            };
        }

        // 随机撤离点 E
        let ex, ey;
        do {
            ex = Math.floor(rng() * size);
            ey = Math.floor(rng() * size);
        } while (world[ey][ex] !== '.');
        world[ey][ex] = 'E';
        this.state.playerPos = { x: ex, y: ey };
        this.state.instances[`${ex},${ey}`] = { type: 'E', visited: false };

        // 随机导入点 I
        let ix, iy;
        do {
            ix = Math.floor(rng() * size);
            iy = Math.floor(rng() * size);
        } while (world[iy][ix] !== '.');
        world[iy][ix] = 'I';
        this.state.instances[`${ix},${iy}`] = { type: 'I', visited: false };

        return world;
    },

    // 更新玩家周围的视野，揭示地图
    updateVisibility() {
        const px = this.state.playerPos.x;
        const py = this.state.playerPos.y;
        const radius = 5;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                let tx = px + dx, ty = py + dy;
                if (tx < 0 || tx >= 50 || ty < 0 || ty >= 50) continue;

                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    let key = `${tx},${ty}`;
                    let tile = this.state.overworld[ty][tx];

                    if (tile !== '.') {
                        if (!this.state.revealedTiles[key]) {
                            this.state.revealedTiles[key] = { tile: tile, visible: true };
                        } else {
                            this.state.revealedTiles[key].visible = true;
                        }
                        this.state.explored.add(key);
                    }
                }
            }
        }
    },

    // 进入某个坐标的地牢
    enterInstance(x, y) {
        const key = `${x},${y}`;
        const loc = this.state.instances[key];

        if (!loc) return null; // 该处没有地牢

        loc.visited = true; // 标记为已访问

        // 初始化该实例的资源包可见状态追踪
        if (!loc.cargoSeen) {
            loc.cargoSeen = new Set();
        }

        if (loc.type === 'W') {
            // 生成 10x10 的工坊地图
            const size = 10;
            let map = Array(size).fill().map(() => Array(size).fill('.'));
            // 边缘是墙
            for(let i=0; i<size; i++) {
                map[0][i] = '#'; map[size-1][i] = '#';
                map[i][0] = '#'; map[i][size-1] = '#';
            }
            map[5][5] = 'T'; // 升级点
            map[5][7] = 'S'; // 速度点
            map[2][2] = 'H'; // 起点
            return { map: map, startRoom: { cx: 2, cy: 2 }, type: 'W', instanceKey: key };
        }

        if (loc.savedMap) {
            // 如果之前来过且被修改过，加载修改后的地图
            return { map: loc.savedMap, isNew: false, instanceKey: key };
        } else {
            // 第一次进入，使用该点位固定的种子生成
            const result = generateDungeon(loc.seed);
            loc.savedMap = result.map; // 立即快照
            loc.cargoSeen = new Set(); // 初始化资源包可见状态
            return { map: result.map, startRoom: result.startRoom, isNew: true, instanceKey: key };
        }
    },

    // 彻底固定：玩家在地牢里捡了东西或开了门，调用此函数保存
    updateInstanceState(x, y, newMap) {
        const key = `${x},${y}`;
        if (this.state.instances[key]) {
            this.state.instances[key].savedMap = newMap;
            this.saveToStorage();
        }
    },

    // 持久化到本地缓存
    saveToStorage(gameState = null) {
        // 序列化 Set
        const instancesCopy = {};
        for (let key in this.state.instances) {
            const loc = this.state.instances[key];
            instancesCopy[key] = {
                ...loc,
                cargoSeen: loc.cargoSeen ? Array.from(loc.cargoSeen) : [],
                cargoGone: loc.cargoGone ? Array.from(loc.cargoGone) : [],
                revealedPoints: loc.revealedPoints ? Array.from(loc.revealedPoints) : []
            };
        }

        const toSave = {
            ...this.state,
            instances: instancesCopy,
            explored: Array.from(this.state.explored)
        };

        // 如果传入了游戏全局状态，则合并保存
        if (gameState) {
            toSave.globalGameState = {
                time: gameState.time,
                resources: gameState.resources,
                probeVisionBonus: gameState.probeVisionBonus,
                tetherMax: gameState.tetherMax,
                transportSpeed: gameState.transportSpeed
            };
        }

        localStorage.setItem('scavenge_world_data', JSON.stringify(toSave));
    },

    createRng(seed) {
        let s = seed;
        return function() {
            s = (s * 1597334677 + 0xbaed2901) >>> 0;
            return s / 0xffffffff;
        };
    }
};