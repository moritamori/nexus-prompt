<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PromptInputView, PromptInputType } from '../../promptops/dsl/prompt/renderer';
  import { generateUniqueInputName } from '../../utils/unique-input-generator';
  import { t } from '../../lib/translations/translations';

  // Props
  let { inputTypes, initial, inputs, editing = false, editingIndex = $bindable(), onMovePrev, onMoveNext }: { inputTypes: PromptInputType[], initial?: Partial<PromptInputView>, inputs?: PromptInputView[], editing?: boolean, editingIndex?: number | null, onMovePrev?: () => void, onMoveNext?: () => void } = $props();

  const dispatch = createEventDispatcher<{ save: PromptInputView; cancel: void; delete: void; movePrev: void; moveNext: void }>();

  // Local state (draft)
  const rename = function(name: string, inputs: PromptInputView[], editing: boolean) {
    if (editing) {
      return name
    } else {
      return generateUniqueInputName(name, inputs, '')
    }
  }
  let type = $state<PromptInputType>((initial?.type as PromptInputType) ?? 'string');
  let name = $state(rename(initial?.name ?? 'target_string', inputs ?? [], editing));
  let required = $state<string>(initial?.required === true ? 'true' : 'false');
  let description = $state<string>(initial?.description ?? '');
  let ref = $state<string>(initial?.ref ?? '');
  let defaultRaw = $state<string>(String(initial?.defaultValue ?? ''));
  let modalEl: HTMLDivElement | null = null;

  function parseDefaultByType(tp: PromptInputType, raw: string): unknown {
    if (raw === '' || raw == null) return undefined;
    try {
      switch (tp) {
        case 'number':
          return Number(raw);
        case 'boolean':
          return raw === 'true' ? true : raw === 'false' ? false : raw;
        case 'array':
        case 'object':
          return JSON.parse(raw);
        default:
          return raw;
      }
    } catch {
      return raw;
    }
  }

  function onSave() {
    const n = name.trim();
    if (!n) return;
    const data: PromptInputView = {
      name: n,
      type,
      required: required === "true" ? true : false,
      ...(description ? { description } : {}),
      ...(ref ? { ref } : {}),
    } as PromptInputView;
    const parsed = parseDefaultByType(type, defaultRaw);
    if (parsed !== undefined) (data as any).defaultValue = parsed;
    dispatch('save', data);
  }

  function onCancel() {
    dispatch('cancel');
  }

  function onDelete() {
    dispatch('delete');
  }
  function onClickMovePrev() {
    if (typeof onMovePrev === 'function') onMovePrev(); else dispatch('movePrev');
  }
  function onClickMoveNext() {
    if (typeof onMoveNext === 'function') onMoveNext(); else dispatch('moveNext');
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && overlayMouseDown) {
      onCancel();
    }
  }

  // キーボードでの閉じる動作は ESC のみを想定し、処理はモーダル側で行う

  // Prevent closing when mousedown starts inside the modal and mouseup ends on the overlay
  let overlayMouseDown = false;
  function handleOverlayMouseDown(e: MouseEvent) {
    overlayMouseDown = e.target === e.currentTarget;
  }
  function handleModalMouseDown() {
    overlayMouseDown = false;
  }

  function handleTypeChange(e: Event) {
    if (!editing && /^target_(string|number|boolean)\d*$/.test(name)) {
      const value = (e.target as HTMLSelectElement).value as PromptInputType;
      const next = rename(`target_${value}`, inputs ?? [], false);
      name = next;
    }
    setDefaultRaw()
  }

  function setDefaultRaw() {
    if (type === 'number') {
      defaultRaw = '3';
    } else if (type === 'boolean') {
      defaultRaw = 'true';
    } else {
      defaultRaw = '';
    }
  }

  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onCancel();
    }
  }

  onMount(() => {
    // モーダルが開いたら、モーダル自体にフォーカスを当てる
    try {
      modalEl?.focus?.();
    } catch {}
  });
</script>

<div class="modal-overlay" role="presentation" onclick={handleOverlayClick} onmousedown={handleOverlayMouseDown}>
  <div bind:this={modalEl} class="modal" role="dialog" aria-modal="true" aria-labelledby="input-modal-title" tabindex="-1" onmousedown={handleModalMouseDown} onkeydown={handleModalKeydown}>
    <div class="modal-header" data-testid="input-modal-header">
      <div class="modal-title" id="input-modal-title">
        差し込み定義を{editing ? '編集' : '追加'}{editing && editingIndex != null ? ` (${editingIndex + 1}番目)` : ''}
        {#if editing}
          <span class="inline-actions">
            <button
              class="inline-action-button"
              type="button"
              onclick={onClickMovePrev}
              disabled={editingIndex == null || (inputs && editingIndex !== null ? editingIndex <= 0 : true)}
              title="前に移動"
            >前に移動</button>
            <button
              class="inline-action-button"
              type="button"
              onclick={onClickMoveNext}
              disabled={editingIndex == null || (inputs && editingIndex !== null ? editingIndex >= (inputs?.length ?? 1) - 1 : true)}
              title="次に移動"
            >次に移動</button>
          </span>
        {/if}
      </div>
      {#if editing}
        <button class="delete-button" type="button" onclick={onDelete}>削除</button>
      {/if}
    </div>
    <form class="modal-form" onsubmit={(e) => { e.preventDefault(); onSave(); }}>
    <div class="modal-body">
      <div class="form-group">
        <label class="field-label" for="input-type">タイプ</label>
        <select bind:value={type} id="input-type" data-testid="input-type" onchange={handleTypeChange}>
          {#each inputTypes as it}
            <option value={it}>{$t(`common.input-type-${it}-name`)}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="field-label" for="input-name" data-testid="input-name">名前</label>
        <input
          type="text"
          id="input-name"
          bind:value={name}
          placeholder="入力名 (例: user_name)"
          pattern="^[A-Za-z][A-Za-z0-9_\-]*$"
          required
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          inputmode="none"
        />
      </div>
      <div class="form-group">
        <label class="field-label" for="input-required">必須</label>
        <select id="input-required" data-testid="input-required" bind:value={required}>
          <option value="true">はい</option>
          <option value="false">いいえ</option>
        </select>
      </div>
      <div class="form-group">
        <label class="field-label" for="input-description">説明</label>
        <textarea bind:value={description} placeholder="任意の説明" id="input-description" data-testid="input-description" rows={2} ></textarea>
      </div>
      <div class="form-group">
        <label class="field-label" for="input-default">デフォルト値</label>
        {#if type === 'string'}
          <textarea bind:value={defaultRaw} id="input-default" data-testid="input-default" rows={2} ></textarea>
        {:else if type === 'number'}
          <input type="number" bind:value={defaultRaw} id="input-default" data-testid="input-default"/>
        {:else if type === 'boolean'}
          <select id="input-default" data-testid="input-default" bind:value={defaultRaw}>
            <option value="">{$t(`common.input-type-boolean-none`)}</option>
            <option value="true">{$t(`common.input-type-boolean-true`)}</option>
            <option value="false">{$t(`common.input-type-boolean-false`)}</option>
          </select>
        {:else}
          <textarea bind:value={defaultRaw} id="input-default" data-testid="input-default" rows={2} ></textarea>
        {/if}
      </div>
    </div>
    <div class="modal-footer">
      <button class="secondary-button" type="button" onclick={onCancel}>キャンセル</button>
      <button class="primary-button" type="submit">{editing ? '更新' : '追加'}</button>
    </div>
    </form>
  </div>
</div>

<style>
  /* Modal styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: #fff;
    width: min(560px, 92vw);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    overflow: hidden;
  }
  .modal-header {
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .modal-title {
    font-weight: 600;
  }
  .inline-actions { display: inline-flex; gap: 8px; margin-left: 8px; }
  .inline-action-button {
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font-size: 12px;
    line-height: 1.2;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .inline-action-button:hover:not(:disabled) {
    background: rgba(0,0,0,0.04);
  }
  .inline-action-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .modal-body {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field-label {
    font-size: 12px;
    color: #555;
  }
  .modal-footer {
    padding: 12px 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid #eee;
  }
</style>
