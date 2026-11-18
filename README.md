# PROBE

A terminal-style extraction game. The fog is eating the world; you run a tethered probe from a mobile rig.

**Play:** https://probe.azusalin.dpdns.org

## Goal
Haul **25 cargo** to the **Command Center (I)** and launch the uplink beacon before the signal dies at **10,000 min**. World vision shrinks by 1 every 1,000 min.

## How to play
- **Overworld:** walk onto `F` factory / `S` supermarket / `M` mine and press EXEC to send the probe in. Each step costs 5 min.
- **Probe:** first press turns it, the next moves. It only sees in a cone. Walking back over the tether retracts it. The tether has a max length.
- **Cargo `O`:** stand on it and press EXEC; it rides the tether home. Cargo you've seen can rot away.
- **Doors `+`:** EXEC next to one to hack it (3–5 min).
- **Evacuate:** go back to `H` and press EXEC twice.
- **`W` workshop:** `T` = tether +1 (5 cargo), `S` = transport speed +1 (2 cargo).
- **`I` command center:** launch the beacon, upgrade probe vision, export your save.
- **`E`:** save point. The game also auto-saves whenever you leave a site.

Controls: WASD / arrow keys, Space / Enter = EXEC. On phones, use the on-screen pad.

## 开发 / Dev
```bash
npm install
npm run dev     # 本地开发
npm run build   # 打包成单个 dist/index.html
```
