import { CONFIG } from './constants.js';

/**
 * 判断点 (x, y) 是否在探头的视野内
 */
export function isVisible(x, y, probe, map) {
    const dist = Math.sqrt((x - probe.x) ** 2 + (y - probe.y) ** 2);
    if (dist > CONFIG.VIEW_DIST) return false;

    const angle = Math.atan2(y - probe.y, x - probe.x) * 180 / Math.PI;
    const fA = { 'w': -90, 's': 90, 'a': 180, 'd': 0 }[probe.facing];
    let diff = Math.abs(angle - fA);
    if (diff > 180) diff = 360 - diff;
    if (diff > CONFIG.CONE_ANGLE) return false;

    return hasLineOfSight(probe.x, probe.y, x, y, map);
}

/**
 * 使用 Bresenham 直线算法判断两点之间是否有遮挡
 */
export function hasLineOfSight(x0, y0, x1, y1, map) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1;
    const sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
        if (cx === x1 && cy === y1) break;

        // 起点不检查遮挡
        if (cx !== x0 || cy !== y0) {
            const tile = map[cy][cx];
            // 墙壁 (#) 和 门 (+) 遮挡视野
            if (tile === '#' || tile === '+') return false;
        }

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            cx += sx;
        }
        if (e2 < dx) {
            err += dx;
            cy += sy;
        }
    }
    return true;
}
