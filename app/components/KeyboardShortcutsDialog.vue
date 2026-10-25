<script setup lang="ts">
import { SHORTCUTS } from '~/lib/keyboard-shortcuts'

/**
 * The list of the player's keyboard shortcuts, opened by the `?` key on any
 * page (app/plugins/keyboard-shortcuts.client.ts) or from the account menu.
 * Mounted by both layouts (the app's and the share pages'). It reads the
 * same table the shortcuts run on, so the two never disagree.
 */

// Open or closed (shared with the plugin and the account menu).
const open = useShortcutsHelp()
</script>

<template>
  <UModal
    v-model:open="open"
    title="Keyboard shortcuts"
    description="For the player, on every page. They wait while you type, and in a menu or a dialog."
  >
    <template #body>
      <!-- One row per shortcut: what it does, then its keys -->
      <dl
        class="divide-y divide-default"
        data-testid="keyboard-shortcuts"
      >
        <div
          v-for="shortcut in SHORTCUTS"
          :key="shortcut.action"
          class="flex items-center justify-between gap-4 py-2"
        >
          <dt class="text-sm">
            {{ shortcut.label }}
          </dt>
          <dd class="flex shrink-0 items-center gap-1">
            <UKbd
              v-for="key in shortcut.keys"
              :key="key"
              :value="key"
            />
          </dd>
        </div>
      </dl>
    </template>
  </UModal>
</template>
