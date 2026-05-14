import { CONFIG } from './constants.js';

export function generateDungeon() {
    let map = Array(CONFIG.SIZE).fill().map(() => Array(CONFIG.SIZE).fill('#'));
    let rooms = [];

    // 房间生成
    for(let k=0; k<15 && rooms.length < 6; k++) {
        let w = Math.floor(Math.random()*4)+4, h = Math.floor(Math.random()*4)+4;
        let x = Math.floor(Math.random()*(CONFIG.SIZE-w-2))+1, y = Math.floor(Math.random()*(CONFIG.SIZE-h-2))+1;
        
        let overlap = rooms.some(r => !(x+w < r.x || x > r.x+r.w || y+h < r.y || y > r.y+r.h));
        if(!overlap) {
            for(let i=y; i<y+h; i++) for(let j=x; j<x+w; j++) map[i][j] = '.';
            rooms.push({x, y, w, h, cx: x+Math.floor(w/2), cy: y+Math.floor(h/2)});
        }
    }

    // 严格 L 型走廊
    for(let i=0; i<rooms.length-1; i++) {
        let r1 = rooms[i], r2 = rooms[i+1];
        let curX = r1.cx, curY = r1.cy;

        while(curX !== r2.cx) {
            curX += (r2.cx > curX ? 1 : -1);
            placePath(curX, curY, map, rooms);
        }
        while(curY !== r2.cy) {
            curY += (r2.cy > curY ? 1 : -1);
            placePath(curX, curY, map, rooms);
        }
    }

    // 资源
    rooms.forEach(r => { if(Math.random() > 0.3) map[r.y+1][r.x+1] = 'O'; });

    return { map, startRoom: rooms[0] };
}

// --- src/mapGen.js ---
function placePath(x, y, map, rooms) {
    if(map[y][x] === '#') {
        // 门生成逻辑优化：
        // 检查这个点是否紧挨着某个房间内部（.）
        const adjToRoom = [
            [0,1],[0,-1],[1,0],[-1,0]
        ].some(([dx, dy]) => {
            let nx = x + dx, ny = y + dy;
            return map[ny] && map[ny][nx] === '.';
        });

        // 如果这个点在墙上且挨着房间内部，它就是一扇门
        if (adjToRoom) {
            map[y][x] = '+';
        } else {
            map[y][x] = '.';
        }
    }
}