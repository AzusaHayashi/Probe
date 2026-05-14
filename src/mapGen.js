import { CONFIG } from '/src/constants.js';

export function generateDungeon() {
    let map = Array(CONFIG.SIZE).fill().map(() => Array(CONFIG.SIZE).fill('#'));
    let rooms = [];

    // 1. 房间生成
    for(let k=0; k<15 && rooms.length < 6; k++) {
        let w = Math.floor(Math.random()*4)+4, h = Math.floor(Math.random()*4)+4;
        let x = Math.floor(Math.random()*(CONFIG.SIZE-w-2))+1, y = Math.floor(Math.random()*(CONFIG.SIZE-h-2))+1;
        
        let overlap = rooms.some(r => !(x+w < r.x || x > r.x+r.w || y+h < r.y || y > r.y+r.h));
        if(!overlap) {
            for(let i=y; i<y+h; i++) for(let j=x; j<x+w; j++) map[i][j] = '.';
            rooms.push({x, y, w, h, cx: x+Math.floor(w/2), cy: y+Math.floor(h/2)});
        }
    }

    // 2. 严格 L 型走廊生成逻辑
    for(let i=0; i<rooms.length-1; i++) {
        let r1 = rooms[i], r2 = rooms[i+1];
        let curX = r1.cx, curY = r1.cy;

        // 水平移动
        while(curX !== r2.cx) {
            curX += (r2.cx > curX ? 1 : -1);
            placePath(curX, curY, map);
        }
        // 垂直移动
        while(curY !== r2.cy) {
            curY += (r2.cy > curY ? 1 : -1);
            placePath(curX, curY, map);
        }
    }

    return { map, rooms };
}

/**
 * 核心修改：智能放置路径和门
 * 逻辑：如果挨着房间地板('.')，且周围没有门('+')，则放门；否则放走廊地板('.')
 */
function placePath(x, y, map) {
    // 如果当前位置已经是房间地板，则不需要处理
    if (map[y][x] === '.') return;

    // 检查上下左右是否有房间地板
    const adjToRoom = [
        [0, 1], [0, -1], [1, 0], [-1, 0]
    ].some(([dx, dy]) => {
        let nx = x + dx, ny = y + dy;
        return map[ny] && map[ny][nx] === '.';
    });

    if (adjToRoom) {
        // 进一步检查周围（包括对角线）是否已经存在门了
        const hasNearbyDoor = [
            [0, 1], [0, -1], [1, 0], [-1, 0],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        ].some(([dx, dy]) => {
            let nx = x + dx, ny = y + dy;
            return map[ny] && map[ny][nx] === '+';
        });

        // 只有附近没门时，才把这格变成门
        map[y][x] = hasNearbyDoor ? '.' : '+';
    } else {
        // 远离房间的地方，全是走廊地板
        map[y][x] = '.';
    }
}