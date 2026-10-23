<!--
  Grip of a draggable row (playlist tracks, "Up next" queue): the only part
  that starts a drag, so the rest of the row stays clickable and scrollable
  on touch screens. Found by useSortableList through `data-drag-handle`.
  The tooltip tells mouse users what the grip is for (screen readers skip
  it: they reorder with Move up/down in the row's menu).
-->
<template>
  <UTooltip
    text="Drag to reorder"
    :content="{ side: 'top' }"
  >
    <span
      class="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center text-dimmed hover:text-muted active:cursor-grabbing"
      aria-hidden="true"
      data-drag-handle
    >
      <UIcon
        name="i-lucide-grip-vertical"
        class="size-4"
      />
    </span>
  </UTooltip>
</template>
