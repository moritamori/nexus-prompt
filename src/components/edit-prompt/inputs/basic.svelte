<script lang="ts">
  import { clickDraggable, dragStart, onDragStartLocal, onDragEndLocal } from './actions/utils';

  let { editorRef, type, typeLabel } = $props();
  const key: string = `target_${type}`;
  const text: string = `{{${key}}}`;
  let isDragging = $state(false);
</script>

<div
  class="input"
  draggable="true"
  use:dragStart={text}
  use:clickDraggable={{ text, editorRef }}
  ondragstart={onDragStartLocal((v) => isDragging = v)}
  ondragend={onDragEndLocal((v) => isDragging = v)}
  data-type={type}
  data-key={key}
  title="差し込み（{typeLabel}）をエディターに追加"
  aria-label="差し込み（{typeLabel}）をエディターに追加"
  role="button"
  tabindex="0">
  {#if isDragging}
    {text}
  {:else}
    差し込み({typeLabel})
  {/if}
</div>

<style>
   @reference "tailwindcss";
  .input {
    @apply px-1 py-1 border border-gray-300 rounded-md text-[12px] transition cursor-pointer font-mono select-none;
    transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .05s ease;
  }

  .input:hover {
    @apply cursor-grab bg-[#f0f7ff] border-[#9ec5fe] shadow-[0_1px_4px_rgba(13,110,253,0.25)];
  }

  .input:active {
    @apply cursor-grabbing -translate-y-px;
  }
</style>
