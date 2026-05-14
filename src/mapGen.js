import { CONFIG } from './constants.js';

export function generateDungeon() {
    // 初始全是墙
    let map = Array(CONFIG.SIZE).fill().map(() => Array(CONFIG.SIZE).fill('#'));
    let rooms = [];

    // 1. 房间生成
    for(let k=0; k<20 && rooms.length < 8; k++) {
        let w = Math.floor(Math.random()*4)+4, h = Math.floor(Math.random()*4)+4;
        let x = Math.floor(Math.random()*(CONFIG.SIZE-w-2))+1, y = Math.floor(Math.random()*(CONFIG.SIZE-h-2))+1;
        
        // 增加间距判定，防止房间贴在一起导致门逻辑混乱
        let overlap = rooms.some(r => !(x+w+1 < r.x || x > r.x+r.w+1 || y+h+1 < r.y || y > r.y+r.h+1));
        if(!overlap) {
            for(let i=y; i<y+h; i++) {
                for(let j=x; j<x+w; j++) {
                    map[i][j] = '.';
                }
            }
            rooms.push({x, y, w, h, cx: x+Math.floor(w/2), cy: y+Math.floor(h/2)});
        }
    }

    // 2. 走廊生成（全部先挖成地板）
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

    // 3. 精准放门逻辑
    // 逻辑：如果一个地板格子的 左右是墙/上下是墙，且它紧挨着房间内部，它就是门
    for (let y = 1; y < CONFIG.SIZE - 1; y++) {
        for (let x = 1; x < CONFIG.SIZE - 1; x++) {
            if (map[y][x] === '.') {
                // 检查是否在房间边缘
                let isHorizontalDoor = (map[y][x-1] === '#' && map[y][x+1] === '#' && (isRoomInternal(x, y-1, rooms) || isRoomInternal(x, y+1, rooms)));
                let isVerticalDoor = (map[y-1][x] === '#' && map[y+1][x] === '#' && (isRoomInternal(x-1, y, rooms) || isRoomInternal(x+1, y, rooms)));
                
                if (isHorizontalDoor || isVerticalDoor) {
                    map[y][x] = '+';
                }
            }
        }
    }

    return { map, startRoom: rooms[0] };
}

// 辅助函数：判断坐标是否在某个房间的内部（不含墙）
function isRoomInternal(x, y, rooms) {
    return rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}