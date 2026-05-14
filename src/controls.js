// controls.js

/**
 * 初始化控制系统
 * @param {Function} onMove - 当玩家尝试移动时调用的函数，传入参数为 'w', 'a', 's', 'd'
 * @param {Function} onExec - 当玩家按下执行键（空格/回车）时调用的函数
 */
export function setupControls(onMove, onExec) {
    // 1. 定义按键映射表，支持 WASD 和 方向键
    const keyMap = {
        'w': 'w', 'arrowup': 'w',
        's': 's', 'arrowdown': 's',
        'a': 'a', 'arrowleft': 'a',
        'd': 'd', 'arrowright': 'd'
    };

    // 2. 键盘事件监听
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        // 处理位移/转向
        if (keyMap[key]) {
            e.preventDefault(); // 阻止浏览器滚动
            onMove(keyMap[key]);
        }

        // 处理确认/交互 (Space 或 Enter)
        if (key === ' ' || key === 'enter') {
            e.preventDefault();
            onExec();
        }
    });

    // 3. 屏幕 UI 按钮监听 (兼容移动端)
    const buttonConfigs = [
        { id: 'btn-up', dir: 'w' },
        { id: 'btn-down', dir: 's' },
        { id: 'btn-left', dir: 'a' },
        { id: 'btn-right', dir: 'd' }
    ];

    buttonConfigs.forEach(config => {
        const btn = document.getElementById(config.id);
        if (btn) {
            // 使用 onpointerdown 以兼容鼠标点击和触摸屏
            btn.onpointerdown = (e) => {
                e.preventDefault();
                onMove(config.dir);
            };
        }
    });

    // 交互按钮
    const execBtn = document.getElementById('btn-exec');
    if (execBtn) {
        execBtn.onpointerdown = (e) => {
            e.preventDefault();
            onExec();
        };
    }
}