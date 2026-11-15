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
Real-player racing and the shared leaderboard use the Claude artifact runtime (`room` and `db` capabilities) and work when the game is published as a Claude artifact. When opened as a plain web page they are unavailable and the game runs solo against AI drivers, saving your best lap in local storage. To host it elsewhere with real-time multiplayer, replace `js/net.js` with a WebSocket or WebRTC backend.
