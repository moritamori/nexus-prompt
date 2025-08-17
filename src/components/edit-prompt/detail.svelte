<script lang="ts">
  import type { Prompt } from '../../types';
  import { onMount, onDestroy } from 'svelte';
  import PromptEditor from './prompt-editor.svelte';
  import { type PromptViewModel, createPromptViewModel, toPromptDsl, type PromptInputView } from '../../promptops/dsl/prompt/renderer';
  import { validateTemplateInputsConsistency } from '../../promptops/dsl/prompt/linter';
  import { storageService } from '../../services/storage';
  import { showToast, entitlements } from '../../stores';
  import BasicInput from './inputs/basic.svelte';
  import InputModal from './input-modal.svelte';

  // Local state
  let promptViewModel = $state<PromptViewModel>({
    id: '',
    name: '',
    template: '',
    inputs: [],
    frameworkRef: '',
    metadata: {},
  });
  let isSaving = $state(false);
  let editorRef: PromptEditor | null = $state(null);
  let showInputModal = $state(false);
  let initialInput: Partial<PromptInputView> | undefined = $state({name: "target_string", type: "string", required: false});
  let editingIndex: number | null = $state(null);
  let addedHistoryEntry = $state(false);
  let popstateHandler: ((e: PopStateEvent) => void) | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  // Constants
  const MAX_PROMPT_CONTENT_LENGTH = 10000;
  const MAX_PROMPT_NAME_LENGTH = 200;
  const MAX_PROMPT_COUNT = 20;
  const INPUT_TYPES = [
    { type: 'string' as const, typeLabel: 'テキスト' },
    { type: 'number' as const, typeLabel: '数値' },
    { type: 'boolean' as const, typeLabel: 'はい・いいえ' },
  ];

  function openAddInputModal(_e: MouseEvent, defaultInput?: Partial<PromptInputView>) {
    if (showInputModal) return;
    editingIndex = null;
    initialInput = defaultInput ?? { name: 'target_string', type: 'string', required: false };
    showInputModal = true;
  }

  function cancelAddInput() {
    if (!showInputModal) return;
    if (editingIndex == null && initialInput?.name) {
      editorRef?.deleteVarName?.(initialInput.name);
    }
    showInputModal = false;
    editingIndex = null;
    initialInput = undefined;
  }

  function handleSaveInput(e: CustomEvent<PromptInputView>) {
    const data = e.detail;
    const name = (data?.name ?? '').trim();
    if (!name) {
      showToast('入力名を入力してください', 'error');
      return;
    }
    const inputs = promptViewModel.inputs ?? [];
    const isDuplicate = inputs.some((inp, i) => inp.name === name && (editingIndex == null || i !== editingIndex));
    if (isDuplicate) {
      showToast('同じ入力名が既に存在します。別の名前を入力してください', 'error');
      return;
    }
    const oldName = (initialInput?.name ?? '').trim();
    data.name = name;
    if (oldName && oldName !== name) {
      editorRef?.replaceVarName?.(oldName, name);
    }
    if (editingIndex != null) {
      promptViewModel.inputs = (promptViewModel.inputs ?? []).map((inp, i) => (i === editingIndex ? data : inp));
      editingIndex = null;
    } else {
      promptViewModel.inputs = [...(promptViewModel.inputs ?? []), data];
    }
    showInputModal = false;
    initialInput = undefined;
  }

  function getTypeLabel(t: string, short: boolean = false): string {
    const label = INPUT_TYPES.find((it) => it.type === t)?.typeLabel ?? t;
    return short ? label.substring(0, 1) : label;
  }

  function getInputChipTitle(inp: PromptInputView): string {
    return `差し込み定義（${getTypeLabel(inp.type)}：${inp.name}）を編集`;
  }

  function onClickInputChip(index: number) {
    if (showInputModal) return;
    editingIndex = index;
    initialInput = { ...(promptViewModel.inputs?.[index] ?? {}) };
    showInputModal = true;
  }

  function triggerDeleteInput(e: CustomEvent<{ name: string }>) {
    const data = e.detail;
    const name = (data?.name ?? '').trim();
    if (name) {
      promptViewModel.inputs = (promptViewModel.inputs ?? []).filter((inp, i) => inp.name !== name && (editingIndex == null || i !== editingIndex));
    }
  }

  function handleDeleteInput() {
    if (initialInput?.name) {
      editorRef?.deleteVarName?.(initialInput.name);
    }
    if (editingIndex != null) {
      promptViewModel.inputs = (promptViewModel.inputs ?? []).filter((_, i) => i !== editingIndex);
    }
    showInputModal = false;
    editingIndex = null;
    initialInput = undefined;
  }

  // Validation: プロンプトVMの検証ロジックを関数に分離
  function validatePromptViewModel(vm: PromptViewModel, maxNameLen: number, maxContentLen: number): string | null {
    if (!vm.template.trim()) {
      return 'プロンプト内容を入力してください';
    }
    if (vm.template.length > maxContentLen) {
      return `プロンプト内容は${maxContentLen.toLocaleString()}文字以内で入力してください`;
    }
    if (vm.name && vm.name.length > maxNameLen) {
      return `プロンプト名は${maxNameLen}文字以内で入力してください`;
    }
    return null;
  }

  // テンプレートと入力の整合チェック（保存前）
  function validateTemplateAndInputsConsistency(): string | null {
    const { missingInTemplate, missingInInputs } = validateTemplateInputsConsistency(
      promptViewModel.template,
      promptViewModel.inputs ?? []
    );
    if ((missingInTemplate.length + missingInInputs.length) > 0) {
      const toText = (arr: string[]) => arr.length ? arr.join(', ') : '-';
      return `プロンプト内容と差し込みの定義が一致しません。\nプロンプト内容に無い差し込み: ${toText(missingInTemplate)}\n差し込みに無いプロンプト内容の変数: ${toText(missingInInputs)}`;
    }
    return null;
  }

  // Event handler, Props
  let { promptSelectionReset, backToList, promptId } = $props();

  // 最新の保存データから読み直す（親との初期化競合を避ける）
  $effect(() => {
    (async () => {
      const latest = await storageService.getAppData();
      if (promptId) {
        const p = latest.prompts.find((pp: Prompt) => pp.id === promptId);
        if (p) {
          promptViewModel = createPromptViewModel(p.content);
        } else {
          showToast('指定されたプロンプトが見つかりませんでした。', 'error', 5000);
          backToList();
        }
      } else {
        promptViewModel = {
          id: '',
          name: '',
          template: '',
          inputs: [],
          frameworkRef: '',
          metadata: {},
        };
      }
    })();
  });

  onMount(() => {
    try {
      window.history.pushState({ view: 'edit-prompt' }, '');
      addedHistoryEntry = true;
    } catch {
      // noop
    }
    popstateHandler = () => {
      if (addedHistoryEntry) {
        addedHistoryEntry = false;
        backToList();
      }
    };
    window.addEventListener('popstate', popstateHandler);

    keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e as any).keyCode === 27) {
        if (showInputModal) return;
        if (isSaving) return;
        e.preventDefault();
        backToListHandler();
      }
    };
    window.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    if (popstateHandler) {
      window.removeEventListener('popstate', popstateHandler);
      popstateHandler = null;
    }
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  });

  async function save(): Promise<void> {
    const validationError = validatePromptViewModel(
      promptViewModel,
      MAX_PROMPT_NAME_LENGTH,
      MAX_PROMPT_CONTENT_LENGTH
    );
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    // テンプレートと入力の整合チェック
    const consistencyError = validateTemplateAndInputsConsistency();
    if (consistencyError) {
      showToast(consistencyError, 'error');
      return;
    }

    try {
      isSaving = true;
      // 常に最新の保存済みデータを基に編集を反映（初期描画タイミング差異の影響を回避）
      const newData = await storageService.getAppData();

      promptViewModel.name = promptViewModel.name.trim() || 'プロンプト';
      if (promptId) {
        const target = newData.prompts.find((pp: Prompt) => pp.id === promptId);
        if (target) {
          target.content = toPromptDsl(promptViewModel);
          target.updatedAt = new Date().toISOString();
        }
      } else {
        if ($entitlements.isFree && newData.prompts.length >= MAX_PROMPT_COUNT) {
          showToast(`フリープランではプロンプトは${MAX_PROMPT_COUNT}個までしか作成できません。プランをアップグレードしてください。`, 'error');
          return;
        }
        const id = crypto.randomUUID();
        promptViewModel.id = id;
        const newPrompt: Prompt = {
          id,
          content: toPromptDsl(promptViewModel),
          order: newData.prompts.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newData.prompts.push(newPrompt);
      }

      await storageService.saveAppData(newData);
      promptSelectionReset();
      showToast('プロンプトを保存しました', 'success');
      backToList();
    } catch (e) {
      showToast('プロンプトの保存に失敗しました', 'error');
    } finally {
      isSaving = false;
    }
  }

  function backToListHandler(): void {
    if (addedHistoryEntry) {
      try {
        window.history.back();
      } catch {
        backToList();
      }
    } else {
      backToList();
    }
  }
</script>

<div class="edit-prompt">
  <button type="button" class="link-back" data-testid="back-to-list-button" onclick={backToListHandler}>← LLMプロンプト一覧へ戻る</button>

  <div class="form-group">
    <label for="promptName">プロンプト名</label>
    <input
      type="text"
      id="promptName"
      data-testid="prompt-name-input"
      bind:value={promptViewModel.name}
      placeholder="プロンプトの名前を入力"
    />
  </div>

  <div class="form-group">
    <div class="label-row">
      <label for="promptContent">プロンプト内容</label>
      <input type="input" id="promptContent" class="hidden" />
      <button
        type="button"
        class="small-icon-button"
        title="差し込み定義を追加"
        aria-label="差し込み定義を追加"
        data-testid="prompt-content-add-button"
        onclick={openAddInputModal}
      >＋</button>
      {#if (promptViewModel.inputs?.length ?? 0) > 0}
        <div class="input-chips">
          {#each promptViewModel.inputs as inp, i}
            <button type="button" class="input-chip" onclick={() => onClickInputChip(i)} title={getInputChipTitle(inp)} aria-label={getInputChipTitle(inp)}>
              {getTypeLabel(inp.type, true)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <section class="inputs">
      {#each INPUT_TYPES as type}
        <BasicInput editorRef={editorRef} type={type.type} typeLabel={type.typeLabel} />
      {/each}
    </section>
    <PromptEditor
      bind:this={editorRef}
      bind:value={promptViewModel.template}
      bind:inputs={promptViewModel.inputs}
      on:openAddInput={(e) => openAddInputModal(new MouseEvent('click'), { name: e.detail.name, type: e.detail.type as any, required: e.detail.required })}
      on:openEditInputByIndex={(e) => onClickInputChip(e.detail.index)}
      on:deleteInput={triggerDeleteInput}
    />
  </div>

  <div class="input-button-group">
    <button id="cancelPrompt" class="secondary-button" data-testid="cancel-prompt-button" onclick={backToListHandler} disabled={isSaving}>
      キャンセル
    </button>
    <button id="savePrompt" class="primary-button" data-testid="save-prompt-button" onclick={save} disabled={isSaving}>
      {isSaving ? '保存中...' : '保存'}
    </button>
  </div>
</div>

{#if showInputModal}
  <InputModal
    initial={initialInput}
    inputTypes={INPUT_TYPES}
    inputs={promptViewModel.inputs}
    editing={editingIndex != null}
    on:save={handleSaveInput}
    on:cancel={cancelAddInput}
    on:delete={handleDeleteInput}
  />
{/if}

<style>
  @reference "tailwindcss";
  .edit-prompt {
    @apply flex flex-col p-0 h-full gap-4;
  }
  .link-back {
    @apply self-start inline-flex bg-none border-none p-0 text-[#0d6efd] cursor-pointer underline text-[13px] leading-6;
  }
  .link-back:hover { 
    @apply opacity-85;
  }
  .inputs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .label-row {
    @apply flex items-center gap-2 mb-1;
  }

  .small-icon-button {
    @apply inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 bg-white;
    width: 22px;
    height: 22px;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }

  .small-icon-button:hover {
    @apply bg-gray-50 border-gray-400;
  }

  .small-icon-button:active {
    @apply bg-gray-100;
  }

  /* Modal styles moved to InputModal */

  .input-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .input-chip {
    @apply inline-flex items-center px-2 py-[2px] rounded border border-gray-300 text-gray-700 bg-white cursor-pointer text-[12px];
  }
  .input-chip:hover {
    @apply bg-gray-50 border-gray-400;
  }
</style>
