I see errors for calling out to klipy. Also there was no search functionality for users and I as still given the predefined gif list.

Look through these logs and identify any errors that could be fixed:

```sh
npm run dev

> gamma@0.1.0 dev
> concurrently -k -n server,client -c cyan,green "npm run dev --workspace=server" "npm run dev --workspace=client/app"

[server] 
[server] > @gamma/server@0.1.0 dev
[server] > ts-node-dev --respawn --transpile-only src/index.ts
[server] 
[client] 
[client] > @gamma/client@0.1.0 dev
[client] > vite --port 5173 --host
[client] 
[server] [INFO] 21:18:13 ts-node-dev ver. 2.0.0 (using ts-node ver. 10.9.2, typescript ver. 5.9.3)
[client] 
[client]   VITE v5.4.21  ready in 952 ms
[client] 
[client]   ➜  Local:   http://localhost:5173/
[client]   ➜  Network: http://192.168.0.129:5173/
[server] [otel] telemetry initialised — exporting to http://localhost:4318
[server] [gamma] server listening on http://localhost:2567
[server] [gamma] WebSocket endpoint  ws://localhost:2567
[client] 9:18:56 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/App.svelte:360:4 A11y: visible, non-interactive elements with an on:click event must be accompanied by a keyboard event handler. Consider whether an interactive element such as <button type="button"> or <a> might be more appropriate. See https://svelte.dev/docs/accessibility-warnings#a11y-click-events-have-key-events for more details.
[client] 9:18:56 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/App.svelte:360:4 A11y: <div> with click handler must have an ARIA role
[client] 9:18:56 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/App.svelte:424:14 A11y: Avoid using autofocus
[client] 9:18:56 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/screens/viewer/InstructionsScreen.svelte:3:11 InstructionsScreen has unused export property 'room'. If it is for external reference only, please consider using `export const room`
[client] 9:18:57 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/screens/viewer/LobbyScreen.svelte:5:11 LobbyScreen has unused export property 'room'. If it is for external reference only, please consider using `export const room`
[client] 9:18:57 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/screens/viewer/ScoreboardScreen.svelte:2:11 ScoreboardScreen has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:57 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/screens/viewer/GameOverScreen.svelte:3:11 GameOverScreen has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:57 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/screens/player/GameScreen.svelte:23:11 GameScreen has unused export property 'myId'. If it is for external reference only, please consider using `export const myId`
[client] 9:18:57 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/components/GameDetailView.svelte:17:0 A11y: visible, non-interactive elements with an on:click event must be accompanied by a keyboard event handler. Consider whether an interactive element such as <button type="button"> or <a> might be more appropriate. See https://svelte.dev/docs/accessibility-warnings#a11y-click-events-have-key-events for more details.
[client] 9:18:57 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/components/GameDetailView.svelte:17:0 A11y: <div> with click handler must have an ARIA role
[client] 9:18:58 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/viewer/FireMatchBlowShakeTV.svelte:4:11 FireMatchBlowShakeTV has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/AudioOverlay.svelte:19:11 AudioOverlay has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/ShaveYak.svelte:21:11 ShaveYak has unused export property 'me'. If it is for external reference only, please consider using `export const me`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/FireMatchBlowShake.svelte:4:11 FireMatchBlowShake has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/LowballMarketplace.svelte:19:11 LowballMarketplace has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/TapSpeed.svelte:13:11 TapSpeed has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/SoundReplication.svelte:16:11 SoundReplication has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/HotPotato.svelte:21:11 HotPotato has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[client] 9:18:59 PM [vite-plugin-svelte] /Users/monica/GitHub/JUSTINWMYLES/gamma/client/app/src/games/player/EscapeMaze.svelte:15:11 EscapeMaze has unused export property 'state'. If it is for external reference only, please consider using `export const state`
[server] [GammaRoom] created — code=YKDF id=Jp7hBYpTn
[server] [GammaRoom] player joined — id=evDMGp5Ch name=G
[server] [GammaRoom] player disconnected — id=evDMGp5Ch consented=false
[server] [GammaRoom] created — code=NDKB id=KGEv9FBLb
[server] [GammaRoom] player joined — id=XrEfePM_9 name=H
[server] [GammaRoom] player reconnect timed out — id=evDMGp5Ch
[server] [GammaRoom] disposed — code=YKDF
[server] [GammaRoom] queue cleared — code=NDKB
[server] [GammaRoom] queue cleared — code=NDKB
[server] [GammaRoom] queue cleared — code=NDKB
[server] [GammaRoom] player disconnected — id=XrEfePM_9 consented=false
[server] [GammaRoom] player reconnect timed out — id=XrEfePM_9
[server] [GammaRoom] disposed — code=NDKB
[server] [GammaRoom] created — code=HHBK id=FQSrUr6vg
[server] [GammaRoom] player joined — id=k9g23KzQK name=n
[server] [GammaRoom] player joined — id=u-5hgwb96 name=e
[server] [GammaRoom] queue cleared — code=HHBK
[server] [AudioOverlay] Klipy API fetch failed for query "sports highlights epic": SyntaxError: Unexpected end of JSON input
[server]     at JSON.parse (<anonymous>)
[server]     at parseJSONFromBytes (node:internal/deps/undici/undici:4259:19)
[server]     at successSteps (node:internal/deps/undici/undici:6882:27)
[server]     at consumeBody (node:internal/deps/undici/undici:6888:9)
[server]     at _Response.json (node:internal/deps/undici/undici:6824:18)
[server]     at fetchKlipyGifs (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/registry-26-audio-overlay/index.ts:151:29)
[server]     at processTicksAndRejections (node:internal/process/task_queues:104:5)
[server]     at getGifPool (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/registry-26-audio-overlay/index.ts:191:19)
[server]     at AudioOverlayGame.runRound (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/registry-26-audio-overlay/index.ts:489:21)
[server]     at AudioOverlayGame.runRounds (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/BaseGame.ts:189:7)
[server] [GammaRoom] player disconnected — id=k9g23KzQK consented=true
[server] [GammaRoom] player disconnected — id=u-5hgwb96 consented=true
[server] [GammaRoom] disposed — code=HHBK
[server] [GammaRoom] game error: TypeError: Cannot read properties of null (reading 'recordingOrder')
[server]     at AudioOverlayGame.runRound (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/registry-26-audio-overlay/index.ts:522:32)
[server]     at AudioOverlayGame.runRounds (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/BaseGame.ts:189:7)
[server]     at AudioOverlayGame.start (/Users/monica/GitHub/JUSTINWMYLES/gamma/server/src/games/BaseGame.ts:129:5)
```