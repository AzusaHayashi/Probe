import { CONFIG } from './constants.js';
import { state } from './gameState.js';

/**
 * 判断点 (x, y) 是否在探头的视野内
 */
export function isVisible(x, y, probe, map) {
    const dist = Math.sqrt((x - probe.x) ** 2 + (y - probe.y) ** 2);
    // 基础视野 + 升级加成
    const viewDist = CONFIG.VIEW_DIST + (state.probeVisionBonus || 0);
    // 增加 0.1 的距离缓冲区
    if (dist > viewDist + 0.1) return false;

    const angle = Math.atan2(y - probe.y, x - probe.x) * 180 / Math.PI;
    const fA = { 'w': -90, 's': 90, 'a': 180, 'd': 0 }[probe.facing];
    let diff = Math.abs(angle - fA);
    if (diff > 180) diff = 360 - diff;
    // 增加 0.5 度的角度缓冲区
    if (diff > CONFIG.CONE_ANGLE + 0.5) return false;

    return hasLineOfSight(probe.x, probe.y, x, y, map);
}

/**
 * 使用 Bresenham 直线算法判断两点之间是否有遮挡
 * 优化：允许检测终点处的墙壁
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
        // 只有在路径中间的点（非起点且非终点）才检查遮挡
        // 这允许墙壁本身被视为“可见”的，即使它会遮挡后面的点
        if ((cx !== x0 || cy !== y0) && (cx !== x1 || cy !== y1)) {
            const tile = map[cy][cx];
            if (tile === '#' || tile === '+') return false;
        }

        if (cx === x1 && cy === y1) break;

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
