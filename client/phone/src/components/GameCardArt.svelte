<script lang="ts">
  /**
   * GameCardArt.svelte
   *
   * Renders themed inline SVG illustrations for each game card.
   * Each game gets a unique micro-illustration that communicates the
   * game concept at a glance. Uses CSS animations for subtle motion.
   *
   * All SVGs use a 200x100 viewBox and inherit theme colors via props.
   */
  export let gameId: string;
  export let accent: string = "#818cf8";
</script>

{#if gameId === "registry-03-tap-speed"}
  <!-- Tap Speed: finger tapping a phone with speed lines -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Phone body -->
    <rect x="75" y="15" width="50" height="72" rx="6" fill="rgba(255,120,60,0.15)" stroke="{accent}" stroke-width="1.5"/>
    <rect x="80" y="22" width="40" height="52" rx="2" fill="rgba(255,80,0,0.08)"/>
    <!-- Tap ripple rings -->
    <circle cx="100" cy="48" r="8" fill="none" stroke="{accent}" stroke-width="1" opacity="0.8" class="tap-ring-1"/>
    <circle cx="100" cy="48" r="14" fill="none" stroke="{accent}" stroke-width="0.7" opacity="0.4" class="tap-ring-2"/>
    <circle cx="100" cy="48" r="20" fill="none" stroke="{accent}" stroke-width="0.5" opacity="0.2" class="tap-ring-3"/>
    <!-- Finger -->
    <ellipse cx="100" cy="44" rx="7" ry="9" fill="{accent}" opacity="0.6" class="tap-finger"/>
    <!-- Speed lines left -->
    <line x1="30" y1="35" x2="55" y2="35" stroke="{accent}" stroke-width="1.5" opacity="0.3" class="speed-l1"/>
    <line x1="35" y1="48" x2="60" y2="48" stroke="{accent}" stroke-width="1" opacity="0.25" class="speed-l2"/>
    <line x1="32" y1="61" x2="58" y2="61" stroke="{accent}" stroke-width="1.2" opacity="0.2" class="speed-l3"/>
    <!-- Speed lines right -->
    <line x1="145" y1="35" x2="170" y2="35" stroke="{accent}" stroke-width="1.5" opacity="0.3" class="speed-l1"/>
    <line x1="140" y1="48" x2="165" y2="48" stroke="{accent}" stroke-width="1" opacity="0.25" class="speed-l2"/>
    <line x1="143" y1="61" x2="168" y2="61" stroke="{accent}" stroke-width="1.2" opacity="0.2" class="speed-l3"/>
    <!-- "VS" text -->
    <text x="100" y="92" text-anchor="middle" fill="{accent}" font-size="8" font-weight="bold" opacity="0.5">1v1</text>
  </svg>

{:else if gameId === "registry-04-escape-maze"}
  <!-- Escape Maze: maze corridors with a glowing exit -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Maze walls -->
    <path d="M30 20 h140 v60 h-140 z" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.2"/>
    <!-- Horizontal walls -->
    <line x1="30" y1="35" x2="80" y2="35" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="60" y1="50" x2="130" y2="50" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="100" y1="35" x2="150" y2="35" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="50" y1="65" x2="110" y2="65" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="130" y1="65" x2="170" y2="65" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <!-- Vertical walls -->
    <line x1="60" y1="20" x2="60" y2="35" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="100" y1="50" x2="100" y2="65" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="130" y1="35" x2="130" y2="50" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="80" y1="35" x2="80" y2="50" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <line x1="150" y1="50" x2="150" y2="65" stroke="{accent}" stroke-width="1.2" opacity="0.4"/>
    <!-- Player dot -->
    <circle cx="45" cy="27" r="3.5" fill="{accent}" class="maze-player"/>
    <!-- Exit glow -->
    <circle cx="160" cy="72" r="6" fill="{accent}" opacity="0.15" class="exit-glow"/>
    <circle cx="160" cy="72" r="3" fill="{accent}" opacity="0.5"/>
    <!-- Dotted path hint -->
    <path d="M45 27 L45 42 L70 42 L70 57 L90 57 L90 72 L120 72 L120 57 L140 57 L140 72 L160 72"
      fill="none" stroke="{accent}" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.2" class="maze-path"/>
  </svg>

{:else if gameId === "registry-06-sound-replication"}
  <!-- Sound Replication: waveform + microphone -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Microphone -->
    <rect x="90" y="20" width="20" height="35" rx="10" fill="rgba(160,40,220,0.15)" stroke="{accent}" stroke-width="1.5"/>
    <line x1="100" y1="55" x2="100" y2="68" stroke="{accent}" stroke-width="1.5"/>
    <line x1="90" y1="68" x2="110" y2="68" stroke="{accent}" stroke-width="1.5" stroke-linecap="round"/>
    <!-- Mic stand arc -->
    <path d="M82 45 Q82 60, 100 60 Q118 60, 118 45" fill="none" stroke="{accent}" stroke-width="1" opacity="0.4"/>
    <!-- Sound waves left -->
    <path d="M78 30 Q72 37, 78 44" fill="none" stroke="{accent}" stroke-width="1" opacity="0.6" class="wave-l1"/>
    <path d="M70 25 Q62 37, 70 49" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="wave-l2"/>
    <path d="M62 20 Q52 37, 62 54" fill="none" stroke="{accent}" stroke-width="0.6" opacity="0.2" class="wave-l3"/>
    <!-- Sound waves right -->
    <path d="M122 30 Q128 37, 122 44" fill="none" stroke="{accent}" stroke-width="1" opacity="0.6" class="wave-r1"/>
    <path d="M130 25 Q138 37, 130 49" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="wave-r2"/>
    <path d="M138 20 Q148 37, 138 54" fill="none" stroke="{accent}" stroke-width="0.6" opacity="0.2" class="wave-r3"/>
    <!-- Waveform bar visualization at bottom -->
    {#each [30,40,50,60,70,80,90,100,110,120,130,140,150,160,170] as bx, i}
      {@const h = Math.max(2, 4 + Math.sin(i * 0.9) * 6 + Math.cos(i * 1.7) * 4)}
      <rect x={bx - 1.5} y={88 - h} width="3" height={h} rx="1.5" fill="{accent}" opacity={0.2 + (i % 3) * 0.1} class="eq-bar" style="animation-delay: {i * 80}ms"/>
    {/each}
  </svg>

{:else if gameId === "registry-07-hot-potato"}
  <!-- Hot Potato: phone with timer + arrows showing passing -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Center phone -->
    <rect x="80" y="20" width="40" height="60" rx="5" fill="rgba(255,140,80,0.12)" stroke="{accent}" stroke-width="1.5"/>
    <!-- Timer circle on phone screen -->
    <circle cx="100" cy="45" r="12" fill="none" stroke="{accent}" stroke-width="1.5" opacity="0.4"/>
    <path d="M100 33 A12 12 0 1 1 88 45" fill="none" stroke="{accent}" stroke-width="2" stroke-linecap="round" class="timer-sweep"/>
    <!-- Timer hand -->
    <line x1="100" y1="45" x2="100" y2="36" stroke="{accent}" stroke-width="1.5" stroke-linecap="round" class="timer-hand"/>
    <!-- Danger text -->
    <text x="100" y="68" text-anchor="middle" fill="{accent}" font-size="6" font-weight="bold" opacity="0.5">PASS!</text>
    <!-- Curved arrows showing passing left -->
    <path d="M70 40 Q50 25, 38 40" fill="none" stroke="{accent}" stroke-width="1.2" opacity="0.4" class="pass-arrow-l"/>
    <polygon points="38,36 38,44 32,40" fill="{accent}" opacity="0.4" class="pass-arrow-l"/>
    <!-- Curved arrows showing passing right -->
    <path d="M130 40 Q150 25, 162 40" fill="none" stroke="{accent}" stroke-width="1.2" opacity="0.4" class="pass-arrow-r"/>
    <polygon points="162,36 162,44 168,40" fill="{accent}" opacity="0.4" class="pass-arrow-r"/>
    <!-- Small person silhouettes -->
    <circle cx="30" cy="55" r="4" fill="{accent}" opacity="0.25"/>
    <rect x="27" y="60" width="6" height="10" rx="2" fill="{accent}" opacity="0.2"/>
    <circle cx="170" cy="55" r="4" fill="{accent}" opacity="0.25"/>
    <rect x="167" y="60" width="6" height="10" rx="2" fill="{accent}" opacity="0.2"/>
    <!-- Pulsing danger ring -->
    <circle cx="100" cy="45" r="18" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.15" class="danger-pulse"/>
  </svg>

{:else if gameId === "registry-14-dont-get-caught"}
  <!-- Don't Get Caught: overhead map view with guard vision cone -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Grid floor tiles -->
    {#each Array(8) as _, col}
      {#each Array(4) as _, row}
        <rect x={25 + col * 20} y={10 + row * 20} width="18" height="18" rx="1"
          fill="{accent}" opacity={((col + row) % 2 === 0) ? 0.04 : 0.02}/>
      {/each}
    {/each}
    <!-- Wall segments -->
    <rect x="45" y="10" width="3" height="38" fill="{accent}" opacity="0.2" rx="1"/>
    <rect x="85" y="30" width="3" height="40" fill="{accent}" opacity="0.2" rx="1"/>
    <rect x="125" y="10" width="3" height="30" fill="{accent}" opacity="0.2" rx="1"/>
    <rect x="65" y="50" width="40" height="3" fill="{accent}" opacity="0.2" rx="1"/>
    <rect x="128" y="55" width="35" height="3" fill="{accent}" opacity="0.2" rx="1"/>
    <!-- Guard with vision cone -->
    <polygon points="130,35 155,20 155,50" fill="{accent}" opacity="0.08" class="vision-cone"/>
    <circle cx="130" cy="35" r="4" fill="{accent}" opacity="0.6"/>
    <!-- Guard 2 -->
    <polygon points="60,65 40,50 40,80" fill="{accent}" opacity="0.06" class="vision-cone-2"/>
    <circle cx="60" cy="65" r="3.5" fill="{accent}" opacity="0.5"/>
    <!-- Player (sneaking) -->
    <circle cx="100" cy="42" r="3" fill="#4ade80" opacity="0.7" class="sneak-player"/>
    <circle cx="100" cy="42" r="6" fill="#4ade80" opacity="0.1" class="sneak-pulse"/>
    <!-- Detection meter -->
    <rect x="93" y="34" width="14" height="2" rx="1" fill="rgba(255,255,255,0.1)"/>
    <rect x="93" y="34" width="5" height="2" rx="1" fill="#ef4444" opacity="0.6" class="detect-bar"/>
  </svg>

{:else if gameId === "registry-17-fire-match-blow-shake"}
  <!-- Camp Fire: match + flame + phone sensors -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Match stick -->
    <rect x="85" y="40" width="4" height="45" rx="1" fill="{accent}" opacity="0.4"/>
    <!-- Match head -->
    <ellipse cx="87" cy="40" rx="5" ry="4" fill="{accent}" opacity="0.6"/>
    <!-- Flame -->
    <path d="M87 38 Q82 25, 87 15 Q90 22, 95 15 Q92 25, 87 38" fill="{accent}" opacity="0.35" class="flame-flicker"/>
    <path d="M87 35 Q84 27, 87 20 Q89 27, 92 20 Q90 27, 87 35" fill="{accent}" opacity="0.55" class="flame-inner"/>
    <!-- Blow wind lines -->
    <line x1="45" y1="28" x2="70" y2="24" stroke="{accent}" stroke-width="0.8" opacity="0.2" class="wind-1"/>
    <line x1="42" y1="35" x2="72" y2="30" stroke="{accent}" stroke-width="1" opacity="0.25" class="wind-2"/>
    <line x1="48" y1="42" x2="74" y2="36" stroke="{accent}" stroke-width="0.8" opacity="0.15" class="wind-3"/>
    <!-- Shake arrows -->
    <path d="M135 30 L145 22 L145 27 L160 27 L160 33 L145 33 L145 38 Z" fill="{accent}" opacity="0.15" class="shake-r"/>
    <path d="M165 50 L155 42 L155 47 L140 47 L140 53 L155 53 L155 58 Z" fill="{accent}" opacity="0.12" class="shake-l"/>
    <!-- Spark particles -->
    <circle cx="78" cy="18" r="1" fill="{accent}" opacity="0.4" class="spark-1"/>
    <circle cx="96" cy="12" r="1.2" fill="{accent}" opacity="0.35" class="spark-2"/>
    <circle cx="82" cy="10" r="0.8" fill="{accent}" opacity="0.3" class="spark-3"/>
    <!-- Campfire logs -->
    <line x1="72" y1="85" x2="102" y2="85" stroke="{accent}" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
    <line x1="76" y1="80" x2="98" y2="88" stroke="{accent}" stroke-width="2.5" stroke-linecap="round" opacity="0.2"/>
  </svg>

{:else if gameId === "registry-19-shave-the-yak"}
  <!-- Shave The Yak: yak face with swipe lines -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Yak body -->
    <ellipse cx="100" cy="58" rx="35" ry="25" fill="{accent}" opacity="0.12"/>
    <!-- Yak head -->
    <ellipse cx="100" cy="40" rx="22" ry="18" fill="{accent}" opacity="0.18"/>
    <!-- Horns -->
    <path d="M80 30 Q72 15, 68 22" fill="none" stroke="{accent}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <path d="M120 30 Q128 15, 132 22" fill="none" stroke="{accent}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <!-- Eyes -->
    <circle cx="90" cy="38" r="2.5" fill="{accent}" opacity="0.6"/>
    <circle cx="110" cy="38" r="2.5" fill="{accent}" opacity="0.6"/>
    <!-- Nose -->
    <ellipse cx="100" cy="48" rx="4" ry="2.5" fill="{accent}" opacity="0.35"/>
    <!-- Shaggy fur lines -->
    <path d="M70 50 Q75 45, 72 40" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.25"/>
    <path d="M130 50 Q125 45, 128 40" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.25"/>
    <path d="M78 60 Q82 55, 80 48" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.2"/>
    <path d="M122 60 Q118 55, 120 48" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.2"/>
    <!-- Swipe lines (razor strokes) -->
    <line x1="50" y1="25" x2="75" y2="55" stroke="{accent}" stroke-width="1.2" opacity="0.3" stroke-linecap="round" class="swipe-1"/>
    <line x1="55" y1="20" x2="80" y2="50" stroke="{accent}" stroke-width="0.8" opacity="0.2" stroke-linecap="round" class="swipe-2"/>
    <!-- Fur clipping particles -->
    <circle cx="60" cy="55" r="1.5" fill="{accent}" opacity="0.25" class="fur-1"/>
    <circle cx="65" cy="48" r="1" fill="{accent}" opacity="0.2" class="fur-2"/>
    <circle cx="58" cy="42" r="1.2" fill="{accent}" opacity="0.15" class="fur-3"/>
    <!-- Scissors -->
    <path d="M150 30 L158 38 M158 30 L150 38" stroke="{accent}" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
    <circle cx="148" cy="28" r="4" fill="none" stroke="{accent}" stroke-width="1" opacity="0.3"/>
    <circle cx="160" cy="28" r="4" fill="none" stroke="{accent}" stroke-width="1" opacity="0.3"/>
  </svg>

{:else if gameId === "registry-20-odd-one-out"}
  <!-- Odd One Out: group of figures with one highlighted differently -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- 5 player figures in a row -->
    <!-- Player 1 (normal) -->
    <circle cx="40" cy="35" r="6" fill="{accent}" opacity="0.25"/>
    <rect x="35" y="43" width="10" height="16" rx="3" fill="{accent}" opacity="0.2"/>
    <!-- Player 2 (normal) -->
    <circle cx="70" cy="35" r="6" fill="{accent}" opacity="0.25"/>
    <rect x="65" y="43" width="10" height="16" rx="3" fill="{accent}" opacity="0.2"/>
    <!-- Player 3 (the ODD ONE — different color, subtle highlight) -->
    <circle cx="100" cy="33" r="7" fill="{accent}" opacity="0.6" class="odd-glow"/>
    <rect x="94" y="42" width="12" height="18" rx="3" fill="{accent}" opacity="0.45"/>
    <!-- Suspicion ring around the odd one -->
    <circle cx="100" cy="45" r="16" fill="none" stroke="{accent}" stroke-width="1" stroke-dasharray="3 2" opacity="0.3" class="suspicion-ring"/>
    <!-- Question mark above -->
    <text x="100" y="18" text-anchor="middle" fill="{accent}" font-size="12" font-weight="bold" opacity="0.4" class="question-pop">?</text>
    <!-- Player 4 (normal) -->
    <circle cx="130" cy="35" r="6" fill="{accent}" opacity="0.25"/>
    <rect x="125" y="43" width="10" height="16" rx="3" fill="{accent}" opacity="0.2"/>
    <!-- Player 5 (normal) -->
    <circle cx="160" cy="35" r="6" fill="{accent}" opacity="0.25"/>
    <rect x="155" y="43" width="10" height="16" rx="3" fill="{accent}" opacity="0.2"/>
    <!-- Vote tally lines at bottom -->
    <line x1="40" y1="75" x2="40" y2="85" stroke="{accent}" stroke-width="2" opacity="0.15"/>
    <line x1="70" y1="75" x2="70" y2="85" stroke="{accent}" stroke-width="2" opacity="0.15"/>
    <line x1="100" y1="75" x2="100" y2="90" stroke="{accent}" stroke-width="3" opacity="0.4"/>
    <line x1="130" y1="75" x2="130" y2="85" stroke="{accent}" stroke-width="2" opacity="0.15"/>
    <line x1="160" y1="75" x2="160" y2="80" stroke="{accent}" stroke-width="2" opacity="0.1"/>
    <!-- Vote label -->
    <text x="100" y="98" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.3">VOTES</text>
  </svg>

{:else if gameId === "registry-25-lowball-marketplace"}
  <!-- Lowball Marketplace: listing cards with lowball bids -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Listing card 1 -->
    <rect x="15" y="12" width="50" height="62" rx="4" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-width="0.8" stroke-opacity="0.2"/>
    <!-- Item placeholder -->
    <rect x="22" y="18" width="36" height="24" rx="2" fill="{accent}" opacity="0.06"/>
    <!-- Couch shape -->
    <rect x="26" y="30" width="28" height="8" rx="2" fill="{accent}" opacity="0.2"/>
    <rect x="24" y="26" width="6" height="14" rx="2" fill="{accent}" opacity="0.15"/>
    <rect x="50" y="26" width="6" height="14" rx="2" fill="{accent}" opacity="0.15"/>
    <!-- Price -->
    <text x="40" y="52" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.5">$450</text>
    <!-- Lowball offer -->
    <text x="40" y="66" text-anchor="middle" fill="#ef4444" font-size="8" font-weight="bold" opacity="0.6" class="lowball-pop">$3</text>

    <!-- Listing card 2 -->
    <rect x="75" y="12" width="50" height="62" rx="4" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-width="0.8" stroke-opacity="0.2"/>
    <!-- Bike shape -->
    <circle cx="90" cy="32" r="6" fill="none" stroke="{accent}" stroke-width="1" opacity="0.2"/>
    <circle cx="108" cy="32" r="6" fill="none" stroke="{accent}" stroke-width="1" opacity="0.2"/>
    <line x1="90" y1="32" x2="100" y2="22" stroke="{accent}" stroke-width="0.8" opacity="0.2"/>
    <line x1="100" y1="22" x2="108" y2="32" stroke="{accent}" stroke-width="0.8" opacity="0.2"/>
    <text x="100" y="52" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.5">$200</text>
    <text x="100" y="66" text-anchor="middle" fill="#ef4444" font-size="8" font-weight="bold" opacity="0.6" class="lowball-pop" style="animation-delay: 0.3s">$1</text>

    <!-- Listing card 3 -->
    <rect x="135" y="12" width="50" height="62" rx="4" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-width="0.8" stroke-opacity="0.2"/>
    <!-- Hot tub shape -->
    <ellipse cx="160" cy="34" rx="14" ry="8" fill="{accent}" opacity="0.1"/>
    <ellipse cx="160" cy="32" rx="14" ry="6" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.25"/>
    <!-- Steam/bubbles -->
    <circle cx="155" cy="24" r="1.2" fill="{accent}" opacity="0.15" class="bubble-1"/>
    <circle cx="160" cy="22" r="1" fill="{accent}" opacity="0.12" class="bubble-2"/>
    <circle cx="165" cy="25" r="0.8" fill="{accent}" opacity="0.1" class="bubble-3"/>
    <text x="160" y="52" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.5">$800</text>
    <text x="160" y="66" text-anchor="middle" fill="#ef4444" font-size="8" font-weight="bold" opacity="0.6" class="lowball-pop" style="animation-delay: 0.6s">$4</text>

    <!-- Dollar signs floating -->
    <text x="30" y="88" fill="{accent}" font-size="8" opacity="0.15" class="dollar-float">$</text>
    <text x="100" y="92" fill="{accent}" font-size="6" opacity="0.1" class="dollar-float" style="animation-delay: 0.5s">$</text>
    <text x="165" y="86" fill="{accent}" font-size="7" opacity="0.12" class="dollar-float" style="animation-delay: 1s">$</text>
  </svg>

{:else if gameId === "registry-26-audio-overlay"}
  <!-- Audio Overlay: GIF frame + microphone + sound waves -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- GIF frame (TV/monitor style) -->
    <rect x="40" y="12" width="72" height="52" rx="4" fill="rgba(80,120,255,0.06)" stroke="{accent}" stroke-width="1.2"/>
    <!-- Stick figure inside "GIF" doing something funny -->
    <circle cx="76" cy="30" r="5" fill="{accent}" opacity="0.3"/>
    <line x1="76" y1="35" x2="76" y2="48" stroke="{accent}" stroke-width="1.2" opacity="0.25"/>
    <line x1="76" y1="40" x2="66" y2="35" stroke="{accent}" stroke-width="1" opacity="0.2"/>
    <line x1="76" y1="40" x2="86" y2="44" stroke="{accent}" stroke-width="1" opacity="0.2"/>
    <line x1="76" y1="48" x2="70" y2="58" stroke="{accent}" stroke-width="1" opacity="0.2"/>
    <line x1="76" y1="48" x2="82" y2="58" stroke="{accent}" stroke-width="1" opacity="0.2"/>
    <!-- "GIF" label -->
    <text x="48" y="22" fill="{accent}" font-size="6" font-weight="bold" opacity="0.3">GIF</text>
    <!-- Microphone on right side -->
    <rect x="138" y="25" width="14" height="24" rx="7" fill="rgba(80,120,255,0.12)" stroke="{accent}" stroke-width="1.2"/>
    <line x1="145" y1="49" x2="145" y2="60" stroke="{accent}" stroke-width="1.2"/>
    <line x1="139" y1="60" x2="151" y2="60" stroke="{accent}" stroke-width="1.2" stroke-linecap="round"/>
    <!-- Sound waves from mic -->
    <path d="M155 32 Q160 37, 155 42" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.4" class="wave-r1"/>
    <path d="M160 28 Q168 37, 160 46" fill="none" stroke="{accent}" stroke-width="0.6" opacity="0.25" class="wave-r2"/>
    <!-- Arrow: mic audio → GIF -->
    <path d="M135 37 L118 37" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.25" stroke-dasharray="2 2"/>
    <polygon points="118,34 118,40 113,37" fill="{accent}" opacity="0.25"/>
    <!-- Category pills at bottom -->
    <rect x="25" y="78" width="32" height="12" rx="6" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-width="0.6" stroke-opacity="0.2"/>
    <text x="41" y="87" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.3">animals</text>
    <rect x="63" y="78" width="28" height="12" rx="6" fill="{accent}" fill-opacity="0.12" stroke="{accent}" stroke-width="0.8" stroke-opacity="0.35"/>
    <text x="77" y="87" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.5">yells</text>
    <rect x="97" y="78" width="36" height="12" rx="6" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-width="0.6" stroke-opacity="0.2"/>
    <text x="115" y="87" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.3">vehicles</text>
    <rect x="139" y="78" width="38" height="12" rx="6" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-width="0.6" stroke-opacity="0.2"/>
    <text x="158" y="87" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.3">evil laughs</text>
  </svg>

{:else if gameId === "registry-10-grid-tap-colors"}
  <!-- Grid Tap Colors: phone grid with colored cells and tap ripple -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Grid of phones -->
    <rect x="35" y="15" width="24" height="32" rx="3" fill="rgba(239,68,68,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="65" y="15" width="24" height="32" rx="3" fill="rgba(59,130,246,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="95" y="15" width="24" height="32" rx="3" fill="rgba(34,197,94,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="125" y="15" width="24" height="32" rx="3" fill="rgba(168,85,247,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="35" y="53" width="24" height="32" rx="3" fill="rgba(245,158,11,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="65" y="53" width="24" height="32" rx="3" fill="rgba(236,72,153,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="95" y="53" width="24" height="32" rx="3" fill="rgba(20,184,166,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <rect x="125" y="53" width="24" height="32" rx="3" fill="rgba(249,115,22,0.15)" stroke="{accent}" stroke-width="1" opacity="0.6"/>
    <!-- Active lit phone (one glowing) -->
    <rect x="65" y="15" width="24" height="32" rx="3" fill="{accent}" fill-opacity="0.35" class="grid-glow"/>
    <!-- Tap ripple on active phone -->
    <circle cx="77" cy="31" r="5" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.7" class="grid-tap-ring-1"/>
    <circle cx="77" cy="31" r="9" fill="none" stroke="{accent}" stroke-width="0.5" opacity="0.3" class="grid-tap-ring-2"/>
    <!-- Finger tapping -->
    <ellipse cx="77" cy="28" rx="5" ry="6" fill="{accent}" opacity="0.5" class="grid-finger"/>
    <!-- Color sequence hint (bottom) -->
    <circle cx="155" cy="25" r="5" fill="#ef4444" opacity="0.3"/>
    <circle cx="155" cy="38" r="5" fill="#3b82f6" opacity="0.3"/>
    <circle cx="155" cy="51" r="5" fill="#22c55e" opacity="0.3"/>
    <circle cx="155" cy="64" r="5" fill="#a855f7" opacity="0.3"/>
    <circle cx="155" cy="77" r="5" fill="#f59e0b" opacity="0.3"/>
    <!-- Arrow from sequence to grid -->
    <path d="M163 50 L175 50" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.2" stroke-dasharray="2 2"/>
    <polygon points="175,47 175,53 180,50" fill="{accent}" opacity="0.2"/>
    <!-- Number labels on phones -->
    <text x="47" y="35" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">1</text>
    <text x="107" y="35" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">3</text>
    <text x="137" y="35" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">4</text>
    <text x="47" y="73" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">5</text>
    <text x="77" y="73" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">6</text>
    <text x="107" y="73" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">7</text>
    <text x="137" y="73" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.3">8</text>
  </svg>

{:else}
  <!-- Fallback: generic gamepad icon -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <rect x="60" y="25" width="80" height="50" rx="12" fill="{accent}" opacity="0.1" stroke="{accent}" stroke-width="1"/>
    <circle cx="82" cy="48" r="4" fill="{accent}" opacity="0.3"/>
    <circle cx="118" cy="48" r="4" fill="{accent}" opacity="0.3"/>
    <rect x="96" y="40" width="8" height="16" rx="2" fill="{accent}" opacity="0.15"/>
  </svg>
{/if}

<style>
  .card-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* ── Tap Speed animations ── */
  .tap-finger {
    animation: tap-bounce 0.6s ease-in-out infinite alternate;
  }
  .tap-ring-1 { animation: ring-expand 1.2s ease-out infinite; }
  .tap-ring-2 { animation: ring-expand 1.2s ease-out 0.2s infinite; }
  .tap-ring-3 { animation: ring-expand 1.2s ease-out 0.4s infinite; }
  .speed-l1 { animation: speed-dash 0.8s ease-in-out infinite alternate; }
  .speed-l2 { animation: speed-dash 0.8s ease-in-out 0.15s infinite alternate; }
  .speed-l3 { animation: speed-dash 0.8s ease-in-out 0.3s infinite alternate; }

  @keyframes tap-bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-3px); }
  }
  @keyframes ring-expand {
    0% { opacity: 0.6; transform: scale(0.7); }
    100% { opacity: 0; transform: scale(1.5); }
  }
  @keyframes speed-dash {
    from { opacity: 0.1; }
    to { opacity: 0.4; }
  }

  /* ── Escape Maze animations ── */
  .maze-player {
    animation: maze-bob 2s ease-in-out infinite;
  }
  .maze-path {
    animation: path-trace 3s linear infinite;
  }
  .exit-glow {
    animation: glow-pulse 1.5s ease-in-out infinite alternate;
  }
  @keyframes maze-bob {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; transform: translateX(2px); }
  }
  @keyframes path-trace {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -30; }
  }
  @keyframes glow-pulse {
    from { opacity: 0.1; r: 5; }
    to { opacity: 0.25; r: 8; }
  }

  /* ── Sound Replication animations ── */
  .wave-l1, .wave-r1 { animation: wave-pulse 1.2s ease-in-out infinite; }
  .wave-l2, .wave-r2 { animation: wave-pulse 1.2s ease-in-out 0.2s infinite; }
  .wave-l3, .wave-r3 { animation: wave-pulse 1.2s ease-in-out 0.4s infinite; }
  .eq-bar { animation: eq-bounce 0.8s ease-in-out infinite alternate; }
  @keyframes wave-pulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.6; }
  }
  @keyframes eq-bounce {
    from { transform: scaleY(0.5); }
    to { transform: scaleY(1.2); }
  }

  /* ── Hot Potato animations ── */
  .timer-hand {
    animation: timer-spin 3s linear infinite;
    transform-origin: 100px 45px;
  }
  .timer-sweep {
    animation: sweep-fill 3s linear infinite;
  }
  .danger-pulse {
    animation: danger-ring 1.5s ease-out infinite;
  }
  .pass-arrow-l { animation: pass-left 1.5s ease-in-out infinite; }
  .pass-arrow-r { animation: pass-right 1.5s ease-in-out 0.75s infinite; }
  @keyframes timer-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes sweep-fill {
    0% { stroke-dashoffset: 75; }
    100% { stroke-dashoffset: 0; }
  }
  @keyframes danger-ring {
    0% { opacity: 0.2; r: 18; }
    100% { opacity: 0; r: 28; }
  }
  @keyframes pass-left {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.5; }
  }
  @keyframes pass-right {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.5; }
  }

  /* ── Don't Get Caught animations ── */
  .vision-cone { animation: cone-sweep 4s ease-in-out infinite; transform-origin: 130px 35px; }
  .vision-cone-2 { animation: cone-sweep 5s ease-in-out 1s infinite; transform-origin: 60px 65px; }
  .sneak-player { animation: sneak-move 3s ease-in-out infinite; }
  .sneak-pulse { animation: sneak-ring 1.5s ease-out infinite; }
  .detect-bar { animation: detect-fill 2s ease-in-out infinite alternate; }
  @keyframes cone-sweep {
    0%, 100% { transform: rotate(-10deg); }
    50% { transform: rotate(10deg); }
  }
  @keyframes sneak-move {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(3px, -1px); }
    75% { transform: translate(-2px, 1px); }
  }
  @keyframes sneak-ring {
    0% { opacity: 0.15; r: 6; }
    100% { opacity: 0; r: 12; }
  }
  @keyframes detect-fill {
    from { width: 3px; }
    to { width: 10px; }
  }

  /* ── Camp Fire animations ── */
  .flame-flicker {
    animation: flame-dance 0.8s ease-in-out infinite alternate;
    transform-origin: 87px 38px;
  }
  .flame-inner {
    animation: flame-dance 0.6s ease-in-out 0.1s infinite alternate;
    transform-origin: 87px 35px;
  }
  .wind-1, .wind-2, .wind-3 {
    animation: wind-blow 2s ease-in-out infinite;
  }
  .wind-2 { animation-delay: 0.3s; }
  .wind-3 { animation-delay: 0.6s; }
  .spark-1 { animation: spark-float 1.5s ease-out infinite; }
  .spark-2 { animation: spark-float 1.8s ease-out 0.3s infinite; }
  .spark-3 { animation: spark-float 2s ease-out 0.6s infinite; }
  .shake-r { animation: shake-bounce 0.5s ease-in-out infinite alternate; }
  .shake-l { animation: shake-bounce 0.5s ease-in-out 0.25s infinite alternate; }
  @keyframes flame-dance {
    from { transform: scaleX(0.9) scaleY(0.95); }
    to { transform: scaleX(1.1) scaleY(1.05); }
  }
  @keyframes wind-blow {
    0%, 100% { opacity: 0.1; transform: translateX(0); }
    50% { opacity: 0.3; transform: translateX(5px); }
  }
  @keyframes spark-float {
    0% { opacity: 0.4; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-10px); }
  }
  @keyframes shake-bounce {
    from { transform: translateX(-2px); }
    to { transform: translateX(2px); }
  }

  /* ── Shave The Yak animations ── */
  .swipe-1 { animation: swipe-slash 1.5s ease-out infinite; }
  .swipe-2 { animation: swipe-slash 1.5s ease-out 0.3s infinite; }
  .fur-1 { animation: fur-fall 2s ease-out infinite; }
  .fur-2 { animation: fur-fall 2s ease-out 0.4s infinite; }
  .fur-3 { animation: fur-fall 2s ease-out 0.8s infinite; }
  @keyframes swipe-slash {
    0% { opacity: 0; }
    30% { opacity: 0.35; }
    100% { opacity: 0; }
  }
  @keyframes fur-fall {
    0% { opacity: 0.3; transform: translate(0, 0); }
    100% { opacity: 0; transform: translate(3px, 10px); }
  }

  /* ── Odd One Out animations ── */
  .odd-glow {
    animation: odd-highlight 2s ease-in-out infinite alternate;
  }
  .suspicion-ring {
    animation: suspicion-spin 6s linear infinite;
  }
  .question-pop {
    animation: q-bounce 1.5s ease-in-out infinite;
  }
  @keyframes odd-highlight {
    from { opacity: 0.45; }
    to { opacity: 0.7; }
  }
  @keyframes suspicion-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes q-bounce {
    0%, 100% { opacity: 0.25; transform: translateY(0); }
    50% { opacity: 0.5; transform: translateY(-2px); }
  }

  /* ── Lowball Marketplace animations ── */
  .lowball-pop {
    animation: lowball-bounce 1.2s ease-in-out infinite;
  }
  .dollar-float {
    animation: dollar-rise 2.5s ease-out infinite;
  }
  .bubble-1, .bubble-2, .bubble-3 {
    animation: bubble-up 2s ease-out infinite;
  }
  .bubble-2 { animation-delay: 0.5s; }
  .bubble-3 { animation-delay: 1s; }
  @keyframes lowball-bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.15); }
  }
  @keyframes dollar-rise {
    0% { opacity: 0.2; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-15px); }
  }
  @keyframes bubble-up {
    0% { opacity: 0.2; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-8px); }
  }

  /* ── Audio Overlay animations ── */
  /* wave-r1, wave-r2 reuse Sound Replication wave-pulse */

  /* ── Grid Tap Colors animations ── */
  .grid-glow {
    animation: grid-glow-pulse 1.5s ease-in-out infinite alternate;
  }
  .grid-finger {
    animation: tap-bounce 0.6s ease-in-out infinite alternate;
  }
  .grid-tap-ring-1 { animation: ring-expand 1.2s ease-out infinite; }
  .grid-tap-ring-2 { animation: ring-expand 1.2s ease-out 0.3s infinite; }
  @keyframes grid-glow-pulse {
    0% { fill-opacity: 0.15; }
    100% { fill-opacity: 0.45; }
  }
</style>
