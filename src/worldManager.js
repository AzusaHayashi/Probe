import { generateDungeon } from './mapGen.js';

export const WorldManager = {
    state: {
        globalSeed: 888,
        overworld: [],       // 大世界 ASCII 地形
        instances: {},       // 记录已访问过的点位："x,y": { seed, map, itemsCleared: false }
        playerPos: { x: 5, y: 5 }, // 玩家在大世界的位置
        currentMode: 'WORLD' // 'WORLD' 或 'INSTANCE'
    },

    // 初始化大世界
    init(seed) {
        this.state.globalSeed = seed;
        this.state.overworld = this.generateOverworld(seed);
        if (!this.loadFromStorage()) {
            this.saveToStorage();
        }
    },

    loadFromStorage() {
        const saved = localStorage.getItem('scavenge_world_data');
        if (saved) {
            this.state = JSON.parse(saved);
            return true;
        }
        return false;
    },

    // 生成大世界地图 (50x50)
    generateOverworld(seed) {
        const rng = this.createRng(seed);
        const size = 50;
        let world = Array(size).fill().map(() => Array(size).fill('.'));

        // 随机撒布“探索点”：F=工厂，S=超市，E=撤离点
        for(let i=0; i<30; i++) {
            let rx = Math.floor(rng() * size);
            let ry = Math.floor(rng() * size);
            const types = ['F', 'S', 'M'];
            world[ry][rx] = types[Math.floor(rng() * types.length)];
            
            // 预设这个点的地牢种子
            this.state.instances[`${rx},${ry}`] = {
                seed: Math.floor(rng() * 100000),
                savedMap: null, // 初始为空
                visited: false
            };
        }
        // 初始撤离点
        world[5][5] = 'E';
        let ix = Math.floor(rng() * size), iy = Math.floor(rng() * size);
        world[iy][ix] = 'I';
        return world;
    },

    // 进入某个坐标的地牢
    enterInstance(x, y) {
        const key = `${x},${y}`;
        const loc = this.state.instances[key];
        
        if (!loc) return null; // 该处没有地牢

        if (loc.savedMap) {
            // 如果之前来过且被修改过，加载修改后的地图
            return { map: loc.savedMap, isNew: false };
        } else {
            // 第一次进入，使用该点位固定的种子生成
            const result = generateDungeon(loc.seed);
            loc.savedMap = result.map; // 立即快照
            return { map: result.map, startRoom: result.startRoom, isNew: true };
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
    saveToStorage() {
        localStorage.setItem('scavenge_world_data', JSON.stringify(this.state));
    },

    createRng(seed) {
        let s = seed;
        return function() {
            s = (s * 1597334677 + 0xbaed2901) >>> 0;
            return s / 0xffffffff;
        };
    }
};