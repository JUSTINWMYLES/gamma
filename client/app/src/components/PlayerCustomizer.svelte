<script lang="ts">
  import type { Room } from "colyseus.js";
  import type { PlayerState } from "../../../shared/types";
  import { createEventDispatcher } from "svelte";
  import IconDesignEditor from "./IconDesignEditor.svelte";
  import {
    createEmptyIconDesign,
    DEFAULT_ICON_BG,
    designFromPlayer,
    serializeIconDesign,
    type IconDesign,
  } from "../../../shared/playerIconDesign";

  export let room: Room;
  export let me: PlayerState | undefined;

  const dispatch = createEventDispatcher<{ done: void }>();

  type IconSource = {
    iconDesign?: string;
    iconEmoji?: string;
    iconText?: string;
    iconBgColor?: string;
  };

  function getInitialDesign(): IconDesign {
    const iconSource = me as IconSource | undefined;
    const playerDesign = me
      ? designFromPlayer({
          iconDesign: iconSource?.iconDesign ?? "",
          iconEmoji: iconSource?.iconEmoji ?? "",
          iconText: iconSource?.iconText ?? "",
          iconBgColor: iconSource?.iconBgColor ?? DEFAULT_ICON_BG,
        })
      : createEmptyIconDesign(DEFAULT_ICON_BG);
    return { ...playerDesign, text: null };
  }

  let design: IconDesign = getInitialDesign();

  function saveCustomization() {
    const finalDesign: IconDesign = {
      ...design,
      bgColor: design.bgColor || DEFAULT_ICON_BG,
      text: null,
    };

    room.send("customize_player", {
      iconEmoji: "",
      iconText: "",
      iconBgColor: finalDesign.bgColor,
      iconDesign: serializeIconDesign(finalDesign),
    });
    dispatch("done");
  }
</script>

<div class="w-full max-w-sm mx-auto space-y-4">
  <p class="text-center text-xs text-gray-400 uppercase tracking-widest font-semibold">Design Your Icon</p>

  <IconDesignEditor bind:design previewName={me?.name ?? "You"} previewSize={96} />

  <button
    class="w-full py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white active:bg-indigo-500 transition-colors active:scale-[0.98]"
    on:click={saveCustomization}
  >Save Icon</button>
</div>
