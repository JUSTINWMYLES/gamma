<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { RoomState, PlayerState } from "../../../../shared/types";
  import PlayerIcon from "../../components/PlayerIcon.svelte";
  export let room: Room;
  export let state: RoomState;
  export let sortedPlayers: PlayerState[];

  $: winner = sortedPlayers[0];
  $: allTied = sortedPlayers.length > 1 && sortedPlayers.every((p) => p.score === sortedPlayers[0].score);

  // Top-3 podium data (bar chart)
  $: top3 = sortedPlayers.slice(0, 3);
  $: maxScore = top3[0]?.score ?? 1;

  function rankNumber(index: number, players: PlayerState[]): number {
    let rank = 1;
    for (let i = 0; i < index; i++) {
      if (players[i].score > players[index].score) rank++;
    }
    return rank;
  }

  function ordinal(rank: number): string {
    if (rank === 1) return "1st";
    if (rank === 2) return "2nd";
    if (rank === 3) return "3rd";
    return `${rank}th`;
  }

  function rankBadge(rank: number): string {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  }

  // Heights as % of the podium column (1st = 100%, others proportional, min 20%)
  function barHeight(score: number): number {
    if (maxScore === 0) return 20;
    return Math.max(20, Math.round((score / maxScore) * 100));
  }

  // Podium display order: 2nd, 1st, 3rd (left-to-right on stage)
  $: podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as PlayerState[];

  const PODIUM_COLORS = ["bg-gray-400", "bg-yellow-400", "bg-amber-600"];
  const LABEL_COLORS = ["text-gray-300", "text-yellow-300", "text-amber-400"];

  // Map from sortedPlayers index to podium visual slot
  function podiumSlot(p: PlayerState): number {
    const idx = top3.indexOf(p);
    // podiumOrder positions: slot 0 = 2nd place, slot 1 = 1st, slot 2 = 3rd
    if (idx === 0) return 1; // 1st → centre
    if (idx === 1) return 0; // 2nd → left
    return 2;               // 3rd → right
  }

  let showFullList = false;
</script>

<div class="flex-1 flex flex-col items-center justify-center gap-8 p-10" data-testid="game-over-screen">
  <h1 class="text-6xl font-black text-yellow-400">{allTied ? "It's a Tie!" : "Game Over!"}</h1>

  {#if top3.length > 0}
    <!-- Podium bar chart -->
    <div class="flex items-end justify-center gap-6 h-64 w-full max-w-xl">
      {#each podiumOrder as p, slot}
        {@const sourceIndex = sortedPlayers.findIndex((sp) => sp.id === p.id)}
        {@const resolvedRank = sourceIndex >= 0 ? rankNumber(sourceIndex, sortedPlayers) : slot + 1}
        {@const h = barHeight(p.score)}
        <div class="flex flex-col items-center justify-end gap-2 flex-1">
          <!-- Name + score above bar -->
          <PlayerIcon player={p} size={40} />
          <p class="font-bold text-center text-sm leading-tight {LABEL_COLORS[slot]}">{p.name}</p>
          <p class="font-mono text-lg font-black {LABEL_COLORS[slot]}">{p.score}</p>
          <!-- The bar -->
          <div
            class="w-full rounded-t-xl {PODIUM_COLORS[slot]} transition-all duration-700"
            style="height: {h}%;"
          ></div>
          <!-- Podium label below -->
          <p class="text-sm font-bold {LABEL_COLORS[slot]}">{rankBadge(resolvedRank)} {ordinal(resolvedRank)}</p>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Full list toggle -->
  <button
    class="text-sm text-gray-500 underline hover:text-gray-300 transition-colors"
    on:click={() => (showFullList = !showFullList)}
  >{showFullList ? 'Hide full scoreboard' : 'Show full scoreboard'}</button>

  {#if showFullList}
    <div class="w-full max-w-md space-y-2">
      {#each sortedPlayers as p, i}
        {@const resolvedRank = rankNumber(i, sortedPlayers)}
        <div class="flex items-center gap-4 bg-gray-800 rounded-xl px-6 py-3">
          <span class="text-2xl w-10 text-center">{rankBadge(resolvedRank)}</span>
          <PlayerIcon player={p} size={32} />
          <span class="flex-1 font-semibold">{p.name}</span>
          <span class="font-mono text-xl">{p.score}</span>
        </div>
      {/each}
    </div>
  {/if}

  <p class="mt-2 text-sm text-gray-500">Use the host phone to continue.</p>
</div>
