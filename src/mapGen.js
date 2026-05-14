import { CONFIG } from './constants.js';

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

    // 2. 走廊生成
    for(let i=0; i<rooms.length-1; i++) {
        let r1 = rooms[i], r2 = rooms[i+1];
        let curX = r1.cx, curY = r1.cy;
        while(curX !== r2.cx) {
            curX += (r2.cx > curX ? 1 : -1);
            placePath(curX, curY, map);
        }
        while(curY !== r2.cy) {
            curY += (r2.cy > curY ? 1 : -1);
            placePath(curX, curY, map);
        }
    }

    // 核心修复：在这里返回结果，并确保 startRoom 存在
    return { 
        map: map, 
        startRoom: rooms[0] || {cx: 0, cy: 0} 
    };
}

function placePath(x, y, map) {
    if (map[y][x] === '.') return;
    const adjToRoom = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
        let nx = x + dx, ny = y + dy;
        return map[ny] && map[ny][nx] === '.';
    });

    if (adjToRoom) {
        const hasNearbyDoor = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => {
            let nx = x + dx, ny = y + dy;
            return map[ny] && map[ny][nx] === '+';
        });
        map[y][x] = hasNearbyDoor ? '.' : '+';
    } else {
        map[y][x] = '.';
    }
}