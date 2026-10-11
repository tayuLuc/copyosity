<script lang="ts">
  import type { ContentKind } from "$lib/overlay-filters";
  import SegmentControl from "$lib/components/SegmentControl.svelte";
  import { t } from "$lib/i18n";

  const {
    value = "all",
    onchange,
  }: {
    value?: ContentKind;
    onchange?: (kind: ContentKind) => void;
  } = $props();

  const segments = $derived<{ id: ContentKind; label: string }[]>([
    { id: "all", label: $t("overlay.text.kind-all") },
    { id: "text", label: $t("overlay.text.kind-text") },
    { id: "image", label: $t("overlay.text.kind-images") },
  ]);

  function select(kind: ContentKind) {
    if (kind === value) return;
    onchange?.(kind);
  }
</script>

<SegmentControl
  ariaLabel={$t("segment.aria-label.content-type")}
  ariaKind="pressed"
  items={segments.map((segment) => ({ id: segment.id, label: segment.label }))}
  value={value}
  onSelect={(id) => select(id as ContentKind)}
/>
