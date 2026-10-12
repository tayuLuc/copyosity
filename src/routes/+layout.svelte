<script lang="ts">
  import { onMount } from "svelte";
  import { followLocaleChanges } from "$lib/i18n";
  import { initInputModality } from "$lib/input-modality";
  import { getAppSettings } from "$lib/api";
  import { adoptTheme, followThemeChanges } from "$lib/theme";
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
    const unlisteners: (() => void)[] = [];
    let stopped = false;
    const release = (fn: () => void) => (stopped ? fn() : unlisteners.push(fn));
    void followLocaleChanges().then(release).catch(() => undefined);
    void followThemeChanges().then(release).catch(() => undefined);
    // The stored choice is the source of truth; the localStorage copy already
    // painted the right palette, so this only corrects a stale or missing mirror.
    void getAppSettings()
      .then((settings) => adoptTheme(settings.theme))
      .catch(() => undefined);
    return () => {
      stopped = true;
      for (const unlisten of unlisteners) unlisten();
    };
  });
</script>

{@render children()}
