<script lang="ts">
  import { onMount } from "svelte";
  import { followLocaleChanges } from "$lib/i18n";
  import { initInputModality } from "$lib/input-modality";
  import "$lib/styles/tokens.css";
  import "$lib/styles/window-chrome.css";
  import "$lib/styles/focus-rings.css";
  import "$lib/styles/button-interaction.css";
  import "$lib/styles/form-controls.css";
  import "$lib/styles/segment-control.css";
  import "$lib/styles/overlay-chrome.css";
  import "$lib/styles/overlay-filters.css";

  const { children } = $props();

  onMount(initInputModality);

  onMount(() => {
    let unlisten: (() => void) | undefined;
    let stopped = false;
    void followLocaleChanges()
      .then((fn) => (stopped ? fn() : (unlisten = fn)))
      .catch(() => undefined);
    return () => {
      stopped = true;
      unlisten?.();
    };
  });
</script>

{@render children()}
