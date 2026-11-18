export const CONFIG = {
    SIZE: 40,
    MAX_TETHER: 35,
    VIEW_DIST: 5.5,
    CONE_ANGLE: 45,
    WORLD_SIZE: 50,
    FOG_INTERVAL: 1000,     // 每 1000 分钟大世界视野 -1
    START_VIEW_RADIUS: 10,
    SIGNAL_DEADLINE: 10000, // 到这个时间信号彻底消失 = 失败
    UPLINK_COST: 25         // 在指挥中心发射上行信标所需货物 = 胜利
};

// 不同地点的货物丰富度
export const SITE_INFO = {
    F: { name: 'FACTORY',     cargoChance: 0.5,  extraChance: 0.15 },
    S: { name: 'SUPERMARKET', cargoChance: 0.75, extraChance: 0.25 },
    M: { name: 'MINE',        cargoChance: 0.6,  extraChance: 0.45 },
    W: { name: 'WORKSHOP' },
    E: { name: 'EVAC / SAVE POINT' },
    I: { name: 'COMMAND CENTER' }
};
