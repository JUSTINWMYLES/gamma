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

{:else if gameId === "registry-27-word-build"}
  <!-- Word Build: phones with letters arranged in a row -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <!-- Phone 1 -->
    <rect x="20" y="25" width="28" height="42" rx="4" fill="rgba(80,200,255,0.08)" stroke="{accent}" stroke-width="1"/>
    <text x="34" y="52" text-anchor="middle" fill="{accent}" font-size="16" font-weight="bold" opacity="0.7" class="wb-letter-1">W</text>
    <!-- Phone 2 -->
    <rect x="56" y="25" width="28" height="42" rx="4" fill="rgba(80,200,255,0.08)" stroke="{accent}" stroke-width="1"/>
    <text x="70" y="52" text-anchor="middle" fill="{accent}" font-size="16" font-weight="bold" opacity="0.7" class="wb-letter-2">OR</text>
    <!-- Phone 3 -->
    <rect x="92" y="25" width="28" height="42" rx="4" fill="rgba(80,200,255,0.08)" stroke="{accent}" stroke-width="1"/>
    <text x="106" y="52" text-anchor="middle" fill="{accent}" font-size="16" font-weight="bold" opacity="0.7" class="wb-letter-3">D</text>
    <!-- Phone 4 (with Done button) -->
    <rect x="128" y="25" width="28" height="42" rx="4" fill="rgba(80,200,255,0.08)" stroke="{accent}" stroke-width="1"/>
    <text x="142" y="48" text-anchor="middle" fill="{accent}" font-size="16" font-weight="bold" opacity="0.7" class="wb-letter-4">S</text>
    <rect x="133" y="55" width="18" height="7" rx="3" fill="{accent}" opacity="0.3" class="wb-done-btn"/>
    <!-- Connecting arrows between phones -->
    <line x1="50" y1="46" x2="54" y2="46" stroke="{accent}" stroke-width="0.8" opacity="0.2" stroke-dasharray="2 1"/>
    <line x1="86" y1="46" x2="90" y2="46" stroke="{accent}" stroke-width="0.8" opacity="0.2" stroke-dasharray="2 1"/>
    <line x1="122" y1="46" x2="126" y2="46" stroke="{accent}" stroke-width="0.8" opacity="0.2" stroke-dasharray="2 1"/>
    <!-- Team labels at bottom -->
    <rect x="30" y="78" width="40" height="12" rx="6" fill="{accent}" fill-opacity="0.1" stroke="{accent}" stroke-width="0.6" stroke-opacity="0.3"/>
    <text x="50" y="87" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.4">Team A</text>
    <rect x="130" y="78" width="40" height="12" rx="6" fill="{accent}" fill-opacity="0.1" stroke="{accent}" stroke-width="0.6" stroke-opacity="0.3"/>
    <text x="150" y="87" text-anchor="middle" fill="{accent}" font-size="5" opacity="0.4">Team B</text>
    <!-- Timer at top -->
    <text x="100" y="16" text-anchor="middle" fill="{accent}" font-size="8" font-weight="bold" opacity="0.3">⏱ 60s</text>
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

{:else if gameId === "registry-40-paint-match"}
  <!-- Paint Match: target color on TV with paint buckets blending toward it -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <rect x="16" y="14" width="74" height="50" rx="6" fill="rgba(255,255,255,0.04)" stroke="{accent}" stroke-width="1.1" opacity="0.35"/>
    <rect x="22" y="20" width="62" height="38" rx="4" fill="url(#paintTarget)" class="paint-target"/>
    <text x="53" y="72" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.4">TARGET</text>

    <circle cx="124" cy="32" r="9" fill="#ef4444" opacity="0.7" class="paint-drop-red"/>
    <circle cx="145" cy="28" r="9" fill="#facc15" opacity="0.75" class="paint-drop-yellow"/>
    <circle cx="164" cy="34" r="9" fill="#3b82f6" opacity="0.75" class="paint-drop-blue"/>
    <circle cx="132" cy="54" r="8" fill="#f8fafc" opacity="0.7" class="paint-drop-white"/>
    <circle cx="154" cy="56" r="8" fill="#111827" opacity="0.8" class="paint-drop-black"/>

    <path d="M118 26 C126 42, 140 46, 150 44 C162 41, 168 51, 162 62 C156 73, 133 77, 117 69 C104 63, 105 44, 118 26Z"
      fill="rgba(255,255,255,0.08)" stroke="{accent}" stroke-width="1" opacity="0.35" class="paint-palette"/>
    <circle cx="136" cy="52" r="16" fill="url(#paintMix)" class="paint-mix-orb"/>
    <circle cx="136" cy="52" r="22" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.18" class="paint-match-ring"/>
    <path d="M90 39 C99 36, 104 36, 112 41" stroke="{accent}" stroke-width="1" opacity="0.2" stroke-dasharray="3 3"/>

    <defs>
      <linearGradient id="paintTarget" x1="22" y1="20" x2="84" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#22d3ee"/>
        <stop offset="0.5" stop-color="#a855f7"/>
        <stop offset="1" stop-color="#fb7185"/>
      </linearGradient>
      <linearGradient id="paintMix" x1="120" y1="38" x2="152" y2="68" gradientUnits="userSpaceOnUse">
        <stop stop-color="#38bdf8"/>
        <stop offset="0.45" stop-color="#c084fc"/>
        <stop offset="1" stop-color="#f472b6"/>
      </linearGradient>
    </defs>
  </svg>

{:else if gameId === "registry-10-grid-tap-colors"}
  <!-- Grid Tap Colors: phone grid with one lit sequence path across the floor -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    {#each [0, 1, 2, 3] as col}
      {#each [0, 1, 2] as row}
        <rect
          x={28 + col * 36}
          y={18 + row * 22}
          width="24"
          height="16"
          rx="3"
          fill="{accent}"
          opacity={(col === 0 && row === 1) || (col === 1 && row === 0) || (col === 2 && row === 2) || (col === 3 && row === 1) ? 0.15 : 0.06}
          stroke="{accent}"
          stroke-width="0.8"
          stroke-opacity="0.2"
        />
      {/each}
    {/each}
    <rect x="28" y="40" width="24" height="16" rx="3" fill="#22d3ee" opacity="0.85" class="grid-lit-phone"/>
    <rect x="64" y="18" width="24" height="16" rx="3" fill="#f472b6" opacity="0.8" class="grid-lit-phone-2"/>
    <rect x="100" y="62" width="24" height="16" rx="3" fill="#facc15" opacity="0.8" class="grid-lit-phone-3"/>
    <rect x="136" y="40" width="24" height="16" rx="3" fill="#4ade80" opacity="0.8" class="grid-lit-phone-4"/>
    <path d="M40 48 C52 38, 67 32, 76 26 C84 22, 97 33, 112 70 C120 82, 132 56, 148 48"
      stroke="{accent}" stroke-width="1.4" opacity="0.35" stroke-dasharray="3 4" class="grid-sequence"/>
    <circle cx="40" cy="48" r="7" fill="none" stroke="{accent}" stroke-width="1" opacity="0.25" class="grid-pulse-start"/>
    <circle cx="148" cy="48" r="7" fill="none" stroke="{accent}" stroke-width="1" opacity="0.2" class="grid-pulse-end"/>
    <text x="100" y="92" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.35">LIGHT → TAP → NEXT</text>
  </svg>

{:else if gameId === "registry-28-wanted-ad"}
  <!-- Wanted Ad: western poster with portrait slot, bounty line, and stamped reward -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <path d="M38 10 H118 L130 22 V82 H38 Z" fill="rgba(245, 222, 179, 0.08)" stroke="{accent}" stroke-width="1.1" opacity="0.4"/>
    <path d="M118 10 V22 H130" fill="none" stroke="{accent}" stroke-width="1.1" opacity="0.3"/>
    <text x="84" y="23" text-anchor="middle" fill="{accent}" font-size="10" font-weight="bold" opacity="0.55">WANTED</text>
    <rect x="53" y="30" width="62" height="26" rx="3" fill="rgba(255,255,255,0.03)" stroke="{accent}" stroke-width="0.8" opacity="0.25"/>
    <circle cx="84" cy="41" r="7" fill="{accent}" opacity="0.24"/>
    <rect x="76" y="49" width="16" height="4" rx="2" fill="{accent}" opacity="0.18"/>
    <line x1="54" y1="62" x2="114" y2="62" stroke="{accent}" stroke-width="0.9" opacity="0.25"/>
    <line x1="54" y1="68" x2="108" y2="68" stroke="{accent}" stroke-width="0.9" opacity="0.22"/>
    <line x1="54" y1="74" x2="110" y2="74" stroke="{accent}" stroke-width="0.9" opacity="0.18"/>
    <circle cx="154" cy="52" r="18" fill="none" stroke="#fb7185" stroke-width="2" opacity="0.45" class="wanted-stamp"/>
    <text x="154" y="49" text-anchor="middle" fill="#fb7185" font-size="7" font-weight="bold" opacity="0.75">$5000</text>
    <text x="154" y="58" text-anchor="middle" fill="#fb7185" font-size="5" font-weight="bold" opacity="0.6">REWARD</text>
    <path d="M142 78 C151 69, 161 69, 170 78" stroke="{accent}" stroke-width="1.4" opacity="0.3"/>
    <line x1="151" y1="78" x2="151" y2="84" stroke="{accent}" stroke-width="1.2" opacity="0.3"/>
    <line x1="161" y1="78" x2="161" y2="84" stroke="{accent}" stroke-width="1.2" opacity="0.3"/>
  </svg>

{:else if gameId === "registry-43-medical-story"}
  <!-- Medical Story: ambulance arrival, patient silhouette, and absurd diagnosis board -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <rect x="16" y="44" width="54" height="24" rx="5" fill="rgba(255,255,255,0.04)" stroke="{accent}" stroke-width="1" opacity="0.35"/>
    <rect x="24" y="34" width="22" height="16" rx="3" fill="{accent}" opacity="0.18"/>
    <rect x="46" y="38" width="14" height="12" rx="2" fill="{accent}" opacity="0.12"/>
    <rect x="35" y="48" width="14" height="4" rx="2" fill="#ef4444" opacity="0.75"/>
    <rect x="40" y="43" width="4" height="14" rx="2" fill="#ef4444" opacity="0.75"/>
    <circle cx="28" cy="72" r="5" fill="{accent}" opacity="0.2"/>
    <circle cx="58" cy="72" r="5" fill="{accent}" opacity="0.2"/>
    <line x1="12" y1="36" x2="4" y2="36" stroke="#facc15" stroke-width="2" opacity="0.4" class="medical-siren"/>
    <line x1="16" y1="30" x2="8" y2="24" stroke="#facc15" stroke-width="1.8" opacity="0.35" class="medical-siren"/>

    <circle cx="108" cy="31" r="7" fill="{accent}" opacity="0.2"/>
    <line x1="108" y1="38" x2="108" y2="56" stroke="{accent}" stroke-width="1.5" opacity="0.3"/>
    <line x1="108" y1="44" x2="98" y2="49" stroke="{accent}" stroke-width="1.2" opacity="0.25"/>
    <line x1="108" y1="44" x2="118" y2="47" stroke="{accent}" stroke-width="1.2" opacity="0.25"/>
    <line x1="108" y1="56" x2="101" y2="67" stroke="{accent}" stroke-width="1.2" opacity="0.25"/>
    <line x1="108" y1="56" x2="115" y2="67" stroke="{accent}" stroke-width="1.2" opacity="0.25"/>
    <circle cx="116" cy="47" r="4" fill="#fb7185" opacity="0.25" class="medical-body-highlight"/>

    <rect x="132" y="18" width="48" height="44" rx="5" fill="rgba(255,255,255,0.03)" stroke="{accent}" stroke-width="1" opacity="0.28"/>
    <text x="156" y="31" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.45">DIAGNOSIS</text>
    <line x1="142" y1="38" x2="171" y2="38" stroke="{accent}" stroke-width="0.9" opacity="0.2"/>
    <line x1="142" y1="45" x2="168" y2="45" stroke="{accent}" stroke-width="0.9" opacity="0.18"/>
    <line x1="142" y1="52" x2="174" y2="52" stroke="{accent}" stroke-width="0.9" opacity="0.16"/>
    <text x="156" y="77" text-anchor="middle" fill="{accent}" font-size="6" opacity="0.35">complaint • procedure • brag</text>
  </svg>

{:else if gameId === "registry-45-news-broadcast"}
  <!-- News Broadcast: anchor desk, broadcast screen, and scrolling lower third -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <rect x="18" y="14" width="72" height="42" rx="5" fill="rgba(255,255,255,0.04)" stroke="{accent}" stroke-width="1" opacity="0.3"/>
    <rect x="24" y="20" width="60" height="24" rx="3" fill="rgba(59,130,246,0.08)"/>
    <path d="M30 38 C38 25, 52 25, 60 38 C67 48, 80 46, 84 30" stroke="{accent}" stroke-width="1.4" opacity="0.35" class="broadcast-wave"/>
    <text x="54" y="50" text-anchor="middle" fill="{accent}" font-size="6" opacity="0.35">LIVE FEED</text>

    <circle cx="132" cy="34" r="11" fill="{accent}" opacity="0.2"/>
    <rect x="118" y="48" width="28" height="14" rx="7" fill="{accent}" opacity="0.16"/>
    <rect x="108" y="64" width="48" height="10" rx="5" fill="rgba(255,255,255,0.04)" stroke="{accent}" stroke-width="0.8" opacity="0.25"/>
    <text x="132" y="71" text-anchor="middle" fill="{accent}" font-size="5" font-weight="bold" opacity="0.45">ANCHOR</text>

    <rect x="16" y="78" width="168" height="10" rx="3" fill="#0f172a" opacity="0.8"/>
    <rect x="16" y="78" width="34" height="10" rx="3" fill="#dc2626" opacity="0.9"/>
    <text x="33" y="85" text-anchor="middle" fill="#ffffff" font-size="5" font-weight="bold">BREAKING</text>
    <text x="58" y="85" fill="{accent}" font-size="5" opacity="0.55" class="ticker-scroll">RIDICULOUS HEADLINE • SCRIPT • VOICE • VOTE</text>
  </svg>

{:else if gameId === "registry-11-tier-ranking"}
  <!-- S-Tier Ranking: stacked tier lanes with cards sorting into consensus ranks -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    {#each [
      { label: 'S', y: 14, color: '#fbbf24' },
      { label: 'A', y: 29, color: '#fb7185' },
      { label: 'B', y: 44, color: '#38bdf8' },
      { label: 'C', y: 59, color: '#4ade80' },
      { label: 'D', y: 74, color: '#a78bfa' },
    ] as tier}
      <rect x="20" y={tier.y} width="160" height="11" rx="5.5" fill="{tier.color}" opacity="0.14"/>
      <text x="30" y={tier.y + 7.5} fill="{tier.color}" font-size="7" font-weight="bold" opacity="0.85">{tier.label}</text>
    {/each}
    <rect x="62" y="15" width="24" height="9" rx="3" fill="rgba(255,255,255,0.06)" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="tier-card-1"/>
    <rect x="116" y="30" width="24" height="9" rx="3" fill="rgba(255,255,255,0.06)" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="tier-card-2"/>
    <rect x="90" y="45" width="24" height="9" rx="3" fill="rgba(255,255,255,0.06)" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="tier-card-3"/>
    <rect x="132" y="60" width="24" height="9" rx="3" fill="rgba(255,255,255,0.06)" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="tier-card-4"/>
    <rect x="72" y="75" width="24" height="9" rx="3" fill="rgba(255,255,255,0.06)" stroke="{accent}" stroke-width="0.8" opacity="0.35" class="tier-card-5"/>
    <path d="M164 18 C171 24, 171 32, 164 38" stroke="{accent}" stroke-width="1" opacity="0.22" class="tier-vote-wave"/>
    <path d="M169 16 C178 24, 178 34, 169 42" stroke="{accent}" stroke-width="0.8" opacity="0.16" class="tier-vote-wave"/>
  </svg>

{:else if gameId === "registry-44-western-standoff"}
  <!-- Western Standoff: duel lane, draw signal, and two phones swinging into aim -->
  <svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="card-svg">
    <rect x="22" y="76" width="156" height="2" rx="1" fill="{accent}" opacity="0.15"/>
    <path d="M42 76 C50 64, 62 60, 72 56" stroke="{accent}" stroke-width="1" opacity="0.18" stroke-dasharray="3 3"/>
    <path d="M158 76 C150 64, 138 60, 128 56" stroke="{accent}" stroke-width="1" opacity="0.18" stroke-dasharray="3 3"/>

    <circle cx="52" cy="34" r="7" fill="{accent}" opacity="0.24"/>
    <rect x="45" y="42" width="14" height="22" rx="4" fill="{accent}" opacity="0.16"/>
    <line x1="59" y1="49" x2="69" y2="41" stroke="{accent}" stroke-width="1.8" opacity="0.28"/>
    <line x1="52" y1="64" x2="46" y2="76" stroke="{accent}" stroke-width="1.4" opacity="0.24"/>
    <line x1="52" y1="64" x2="58" y2="76" stroke="{accent}" stroke-width="1.4" opacity="0.24"/>
    <g class="standoff-phone-left">
      <rect x="70" y="43" width="24" height="11" rx="3" fill="rgba(255,255,255,0.04)" stroke="{accent}" stroke-width="1.1" opacity="0.5"/>
      <line x1="94" y1="48.5" x2="114" y2="48.5" stroke="{accent}" stroke-width="2.1" stroke-linecap="round" opacity="0.42"/>
      <circle cx="118" cy="48.5" r="2.8" fill="#facc15" opacity="0.9" class="standoff-muzzle-flash"/>
    </g>

    <circle cx="148" cy="34" r="7" fill="{accent}" opacity="0.24"/>
    <rect x="141" y="42" width="14" height="22" rx="4" fill="{accent}" opacity="0.16"/>
    <line x1="141" y1="49" x2="131" y2="41" stroke="{accent}" stroke-width="1.8" opacity="0.28"/>
    <line x1="148" y1="64" x2="142" y2="76" stroke="{accent}" stroke-width="1.4" opacity="0.24"/>
    <line x1="148" y1="64" x2="154" y2="76" stroke="{accent}" stroke-width="1.4" opacity="0.24"/>
    <g class="standoff-phone-right">
      <rect x="106" y="43" width="24" height="11" rx="3" fill="rgba(255,255,255,0.04)" stroke="{accent}" stroke-width="1.1" opacity="0.5"/>
      <line x1="106" y1="48.5" x2="86" y2="48.5" stroke="{accent}" stroke-width="2.1" stroke-linecap="round" opacity="0.42"/>
    </g>

    <circle cx="100" cy="22" r="10" fill="none" stroke="#fb7185" stroke-width="1.6" opacity="0.55" class="standoff-draw-ring"/>
    <text x="100" y="25" text-anchor="middle" fill="#fb7185" font-size="7" font-weight="bold" opacity="0.85">DRAW</text>
    <path d="M100 32 L100 38" stroke="#fb7185" stroke-width="1.4" opacity="0.45"/>
    <text x="100" y="93" text-anchor="middle" fill="{accent}" font-size="7" font-weight="bold" opacity="0.38">TURN • AIM • FIRE</text>
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

  /* ── Paint Match animations ── */
  .paint-target { animation: paint-target-breathe 2.6s ease-in-out infinite alternate; }
  .paint-palette { animation: paint-palette-float 3s ease-in-out infinite alternate; }
  .paint-mix-orb { animation: paint-orb-shift 3.2s ease-in-out infinite alternate; }
  .paint-match-ring { animation: paint-ring-pulse 1.8s ease-out infinite; }
  .paint-drop-red, .paint-drop-yellow, .paint-drop-blue, .paint-drop-white, .paint-drop-black {
    animation: paint-drop-bob 2s ease-in-out infinite alternate;
  }
  .paint-drop-yellow { animation-delay: 0.2s; }
  .paint-drop-blue { animation-delay: 0.4s; }
  .paint-drop-white { animation-delay: 0.6s; }
  .paint-drop-black { animation-delay: 0.8s; }
  @keyframes paint-target-breathe {
    from { opacity: 0.9; }
    to { opacity: 0.75; }
  }
  @keyframes paint-palette-float {
    from { transform: translateY(0); }
    to { transform: translateY(-2px); }
  }
  @keyframes paint-orb-shift {
    from { transform: scale(0.96); }
    to { transform: scale(1.04); }
  }
  @keyframes paint-ring-pulse {
    0% { opacity: 0.22; transform: scale(0.9); }
    100% { opacity: 0; transform: scale(1.12); }
  }
  @keyframes paint-drop-bob {
    from { transform: translateY(0); }
    to { transform: translateY(2px); }
  }

  /* ── Grid Tap Colors animations ── */
  .grid-lit-phone, .grid-lit-phone-2, .grid-lit-phone-3, .grid-lit-phone-4 {
    animation: grid-light-pop 1.1s ease-in-out infinite alternate;
  }
  .grid-lit-phone-2 { animation-delay: 0.25s; }
  .grid-lit-phone-3 { animation-delay: 0.5s; }
  .grid-lit-phone-4 { animation-delay: 0.75s; }
  .grid-sequence { animation: grid-sequence-run 2.8s linear infinite; }
  .grid-pulse-start, .grid-pulse-end { animation: grid-pulse-ring 1.6s ease-out infinite; }
  .grid-pulse-end { animation-delay: 0.8s; }
  @keyframes grid-light-pop {
    from { opacity: 0.55; }
    to { opacity: 0.95; }
  }
  @keyframes grid-sequence-run {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -28; }
  }
  @keyframes grid-pulse-ring {
    0% { opacity: 0.25; transform: scale(0.85); }
    100% { opacity: 0; transform: scale(1.3); }
  }

  /* ── Wanted Ad animations ── */
  .wanted-stamp { animation: wanted-stamp-thump 2.4s ease-in-out infinite; transform-origin: 154px 52px; }
  @keyframes wanted-stamp-thump {
    0%, 100% { transform: rotate(-8deg) scale(1); }
    20% { transform: rotate(-8deg) scale(1.06); }
    40% { transform: rotate(-8deg) scale(1); }
  }

  /* ── Medical Story animations ── */
  .medical-siren { animation: medical-flash 0.9s ease-in-out infinite alternate; }
  .medical-body-highlight { animation: medical-highlight 1.7s ease-in-out infinite alternate; }
  @keyframes medical-flash {
    from { opacity: 0.15; }
    to { opacity: 0.5; }
  }
  @keyframes medical-highlight {
    from { opacity: 0.15; transform: scale(0.9); }
    to { opacity: 0.35; transform: scale(1.1); }
  }

  /* ── News Broadcast animations ── */
  .broadcast-wave { animation: broadcast-signal 2s ease-in-out infinite; }
  .ticker-scroll { animation: ticker-slide 4s linear infinite; }
  @keyframes broadcast-signal {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.55; }
  }
  @keyframes ticker-slide {
    from { transform: translateX(0); }
    to { transform: translateX(-18px); }
  }

  /* ── S-Tier Ranking animations ── */
  .tier-card-1, .tier-card-2, .tier-card-3, .tier-card-4, .tier-card-5 {
    animation: tier-card-settle 2.2s ease-in-out infinite alternate;
  }
  .tier-card-2 { animation-delay: 0.15s; }
  .tier-card-3 { animation-delay: 0.3s; }
  .tier-card-4 { animation-delay: 0.45s; }
  .tier-card-5 { animation-delay: 0.6s; }
  .tier-vote-wave { animation: tier-vote-pulse 1.8s ease-in-out infinite; }
  @keyframes tier-card-settle {
    from { opacity: 0.25; }
    to { opacity: 0.5; }
  }
  @keyframes tier-vote-pulse {
    0%, 100% { opacity: 0.12; }
    50% { opacity: 0.32; }
  }

  /* ── Western Standoff animations ── */
  .standoff-phone-left { animation: standoff-aim-left 1.8s ease-in-out infinite alternate; transform-origin: 82px 48px; }
  .standoff-phone-right { animation: standoff-aim-right 1.8s ease-in-out infinite alternate; transform-origin: 118px 48px; }
  .standoff-draw-ring { animation: standoff-draw-pulse 1.2s ease-in-out infinite; transform-origin: 100px 22px; }
  .standoff-muzzle-flash { animation: standoff-flash 0.5s ease-in-out infinite alternate; }
  @keyframes standoff-aim-left {
    from { transform: rotate(-10deg) translateX(-1px); }
    to { transform: rotate(2deg) translateX(1px); }
  }
  @keyframes standoff-aim-right {
    from { transform: rotate(10deg) translateX(1px); }
    to { transform: rotate(-2deg) translateX(-1px); }
  }
  @keyframes standoff-draw-pulse {
    0%, 100% { transform: scale(0.95); opacity: 0.4; }
    50% { transform: scale(1.08); opacity: 0.75; }
  }
  @keyframes standoff-flash {
    from { opacity: 0.2; r: 2.2px; }
    to { opacity: 1; r: 3.4px; }
  }

  /* ── Word Build animations ── */
  .wb-letter-1 { animation: wb-pop 1.5s ease-in-out infinite; }
  .wb-letter-2 { animation: wb-pop 1.5s ease-in-out 0.2s infinite; }
  .wb-letter-3 { animation: wb-pop 1.5s ease-in-out 0.4s infinite; }
  .wb-letter-4 { animation: wb-pop 1.5s ease-in-out 0.6s infinite; }
  .wb-done-btn { animation: wb-btn-glow 2s ease-in-out infinite alternate; }
  @keyframes wb-pop {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.9; }
  }
  @keyframes wb-btn-glow {
    from { opacity: 0.2; }
    to { opacity: 0.5; }
  }
</style>
