import { CONFIG } from './constants.js';

// 确定性随机数生成器 (LCG)
function createRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 1597334677 + 0xbaed2901) >>> 0;
        return s / 0xffffffff;
    };
}

export function generateDungeon(seed) {
    const rng = createRandom(seed);
    
    // 初始全是墙
    let map = Array(CONFIG.SIZE).fill().map(() => Array(CONFIG.SIZE).fill('#'));
    let rooms = [];

    // 1. 房间生成
    for(let k=0; k<20 && rooms.length < 8; k++) {
        let w = Math.floor(rng()*4)+4, h = Math.floor(rng()*4)+4;
        let x = Math.floor(rng()*(CONFIG.SIZE-w-2))+1, y = Math.floor(rng()*(CONFIG.SIZE-h-2))+1;
        
        let overlap = rooms.some(r => !(x+w+1 < r.x || x > r.x+r.w+1 || y+h+1 < r.y || y > r.y+r.h+1));
        if(!overlap) {
            for(let i=y; i<y+h; i++) {
                for(let j=x; j<x+w; j++) {
                    map[i][j] = '.';
                }
            }
            rooms.push({x, y, w, h, cx: x+Math.floor(w/2), cy: y+Math.floor(h/2)});
            
            // 放置资源包 O
            if (rng() > 0.5) {
                let ox = x + Math.floor(rng() * w);
                let oy = y + Math.floor(rng() * h);
                if (map[oy][ox] === '.') map[oy][ox] = 'O';
            }
        }
    }

    // 2. 走廊生成
    for(let i=0; i<rooms.length-1; i++) {
        let r1 = rooms[i], r2 = rooms[i+1];
        let curX = r1.cx, curY = r1.cy;

        while(curX !== r2.cx) {
            curX += (r2.cx > curX ? 1 : -1);
            map[curY][curX] = '.';
        }
        while(curY !== r2.cy) {
            curY += (r2.cy > curY ? 1 : -1);
            map[curY][curX] = '.';
        }
    }

    // 3. 精准放门
    for (let y = 1; y < CONFIG.SIZE - 1; y++) {
        for (let x = 1; x < CONFIG.SIZE - 1; x++) {
            if (map[y][x] === '.') {
                let isHorizontalDoor = (map[y][x-1] === '#' && map[y][x+1] === '#' && (isRoomInternal(x, y-1, rooms) || isRoomInternal(x, y+1, rooms)));
                let isVerticalDoor = (map[y-1][x] === '#' && map[y+1][x] === '#' && (isRoomInternal(x-1, y, rooms) || isRoomInternal(x+1, y, rooms)));
                if (isHorizontalDoor || isVerticalDoor) map[y][x] = '+';
            }
        }
    }

    return { 
        map: map, 
        startRoom: rooms[0] 
    };
}

function isRoomInternal(x, y, rooms) {
    return rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}