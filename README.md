# Apex Rush

A 3D multiplayer car racing game for the browser, built with HTML, CSS, JavaScript and Three.js. No install or build step.

- Nitro boost and drifting (drift to charge nitro)
- 3 cars and 3 maps (Neon District, Red Canyon, Frost Ridge)
- AI drivers fill the grid; live in-race leaderboard and minimap
- Touch controls on phones

## Run
Open `index.html` in a browser, or serve the folder (for example with GitHub Pages).

## Controls
W / Up gas, S / Down brake, A D / arrows steer, Space drift, Shift nitro, R reset car.

## Multiplayer
**Room codes (works anywhere, including GitHub Pages)**
1. One player clicks **Create room** and shares the 5-letter code.
2. Friends type the code and click **Join**.
3. The host clicks **Start for everyone**. Everyone starts the same race together; AI drivers fill the remaining grid spots.

Connections are peer-to-peer (WebRTC via [PeerJS](https://peerjs.com), using its free public signaling server). Strict corporate networks or some mobile data connections can block WebRTC without a TURN server. The host relays everyone's car positions, so if the host leaves the room ends.

**Inside Claude:** when the game is published as a Claude artifact, it uses the `room` and `db` capabilities instead, with a shared per-map best-lap leaderboard.
