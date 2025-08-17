<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PromptInputView, PromptInputType } from '../../promptops/dsl/prompt/renderer';
  import { generateUniqueInputName } from '../../utils/unique-input-generator';

  // Props
  let { inputTypes, initial, inputs, editing = false }: { inputTypes: { type: PromptInputType; typeLabel: string }[], initial?: Partial<PromptInputView>, inputs?: PromptInputView[], editing?: boolean } = $props();

  const dispatch = createEventDispatcher<{ save: PromptInputView; cancel: void; delete: void }>();

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
  let required = $state<string>(String(initial?.required) ?? 'false');
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

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && overlayMouseDown) {
      onCancel();
    }
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCancel();
    }
  }

  // Prevent closing when mousedown starts inside the modal and mouseup ends on the overlay
  let overlayMouseDown = false;
  function handleOverlayMouseDown(e: MouseEvent) {
    overlayMouseDown = e.target === e.currentTarget;
  }
  function handleModalMouseDown() {
    overlayMouseDown = false;
  }

  function handleTypeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as PromptInputType;
    if (value === (initial?.type as PromptInputType | undefined)) {
      name = (initial?.name ?? '') as string;
    } else {
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

  // 型に応じてデフォルト値を軽く初期化
  $effect(() => {
    if (defaultRaw === '') {
      setDefaultRaw()
    }
  });

  function handleModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      // 入力中のEnterで保存。オーバーレイのkeydownへ泡上がらないようにする
      e.preventDefault();
      e.stopPropagation();
      onSave();
    }
  }

  onMount(() => {
    // オーバーレイがフォーカスを奪わないよう、モーダル本体に初期フォーカス
    try {
      modalEl?.focus?.();
    } catch {}
  });
</script>

<div class="modal-overlay" role="button" aria-label="閉じる" tabindex="0" onclick={handleOverlayClick} onkeydown={handleOverlayKeydown} onmousedown={handleOverlayMouseDown}>
  <div bind:this={modalEl} class="modal" role="dialog" aria-modal="true" aria-labelledby="input-modal-title" tabindex="-1" onmousedown={handleModalMouseDown} onkeydown={handleModalKeydown}>
    <div class="modal-header">
      <div class="modal-title" id="input-modal-title">差し込み定義を{editing ? '編集' : '追加'}</div>
      {#if editing}
        <button class="delete-button" type="button" onclick={onDelete}>削除</button>
      {/if}
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="field-label" for="input-type">タイプ</label>
        <select bind:value={type} id="input-type" onchange={handleTypeChange}>
          {#each inputTypes as it}
            <option value={it.type}>{it.typeLabel}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label class="field-label" for="input-name">名前</label>
        <input type="text" bind:value={name} placeholder="入力名 (例: user_name)" id="input-name" />
      </div>
      <div class="form-group">
        <label class="field-label" for="input-required">必須</label>
        <select id="input-default" bind:value={required}>
          <option value="true">はい</option>
          <option value="false">いいえ</option>
        </select>
      </div>
      <div class="form-group">
        <label class="field-label" for="input-description">説明</label>
        <input type="text" bind:value={description} placeholder="任意の説明" id="input-description" />
      </div>
      <div class="form-group">
        <label class="field-label" for="input-default">デフォルト値</label>
        {#if type === 'string'}
          <input type="text" bind:value={defaultRaw} id="input-default" />
        {:else if type === 'number'}
          <input type="number" bind:value={defaultRaw} id="input-default" />
        {:else if type === 'boolean'}
          <select id="input-default" bind:value={defaultRaw}>
            <option value="true">はい</option>
            <option value="false">いいえ</option>
          </select>
        {:else}
          <input type="text" bind:value={defaultRaw} id="input-default" />
        {/if}
      </div>
    </div>
    <div class="modal-footer">
      <button class="secondary-button" type="button" onclick={onCancel}>キャンセル</button>
      <button class="primary-button" type="button" onclick={onSave}>{editing ? '更新' : '追加'}</button>
    </div>
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
