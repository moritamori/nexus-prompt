<script lang="ts">
  import type { Prompt } from '../../types';
  import { useNavHistory } from '../../actions/navigation';
  import PromptEditor from './prompt-editor.svelte';
  import { type PromptViewModel, createPromptViewModel, toPromptDsl, type PromptInputView } from '../../promptops/dsl/prompt/renderer';
  import { validateTemplateInputsConsistency } from '../../promptops/dsl/prompt/linter';
  import { storageService } from '../../services/storage';
  import { showToast, entitlements } from '../../stores';
  import BasicInput from './inputs/basic.svelte';
  import InputModal from './input-modal.svelte';
  import { t } from '../../lib/translations/translations';
  import type { PromptInputType } from '../../promptops/dsl/prompt/renderer';

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
  let fromInptDraggable: boolean = $state(false);

  // Constants
  const MAX_PROMPT_CONTENT_LENGTH = 10000;
  const MAX_PROMPT_NAME_LENGTH = 200;
  const MAX_PROMPT_COUNT = 20;
  const INPUT_TYPES = [ 'string', 'number', 'boolean' ] as PromptInputType[];

  function openAddInputModal(defaultInput?: Partial<PromptInputView>, fromDraggable: boolean = false) {
    if (showInputModal) return;
    editingIndex = null;
    initialInput = defaultInput ?? { name: 'target_string', type: 'string', required: false };
    showInputModal = true;
    fromInptDraggable = fromDraggable;
  }

  function cancelAddInput() {
    if (!showInputModal) return;
    if (editingIndex == null && initialInput?.name && !fromInptDraggable) {
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

  function handleMoveByIndex(index: number, direction: 'up' | 'down'): void {
    const inputs = [...(promptViewModel.inputs ?? [])];
    if (inputs.length === 0) return;
    if (index < 0 || index >= inputs.length) return;
    // 指定に合わせて境界をクランプ
    const tentative = direction === 'up' ? index + 1 : index - 1;
    const newIndex = Math.max(0, Math.min(tentative, inputs.length - 1));
    if (newIndex === index) return;
    const [item] = inputs.splice(index, 1);
    inputs.splice(newIndex, 0, item);
    promptViewModel.inputs = inputs;
    editingIndex = newIndex;
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

  const { backToListHandler } = useNavHistory(() => backToList(), {
    getDetailState: () => ({ view: 'detail', id: promptId ?? null }),
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
          shared: true,
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

  function backToListButtonHandler(): void {
    if (showInputModal) return;
    if (isSaving) return;
    backToListHandler();
  }
</script>

<div class="edit-prompt">
  <button type="button" class="link-back" data-testid="back-to-list-button" onclick={backToListButtonHandler}>← LLMプロンプト一覧へ戻る</button>

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
        onclick={() => openAddInputModal(undefined)}
      >＋</button>
      {#if (promptViewModel.inputs?.length ?? 0) > 0}
        <div class="input-chips">
          {#each promptViewModel.inputs as inp, i}
            <button 
              type="button" 
              class="input-chip" 
              onclick={() => onClickInputChip(i)} 
              title={`差し込み定義（${$t(`common.input-type-${inp.type}-name`)}：${inp.name}）を編集`} 
              aria-label={`差し込み定義（${$t(`common.input-type-${inp.type}-name`)}：${inp.name}）を編集`}
              data-testid={`input-chip-${inp.name}`}
            >
              {`{{${inp.name}}}`}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <section class="inputs">
      {#each INPUT_TYPES as type}
        <BasicInput 
          editorRef={editorRef} 
          type={type} 
          typeLabel={$t(`common.input-type-${type}-name`)} 
        />
      {/each}
    </section>
    <PromptEditor
      bind:this={editorRef}
      bind:value={promptViewModel.template}
      bind:inputs={promptViewModel.inputs}
      on:openAddInput={(e) => openAddInputModal({ name: e.detail.name, type: e.detail.type as any, required: e.detail.required }, e.detail.fromDraggable)}
      on:openEditInputByIndex={(e) => onClickInputChip(e.detail.index)}
      on:deleteInput={triggerDeleteInput}
    />
  </div>

  <div class="input-button-group">
    <button id="cancelPrompt" class="secondary-button" data-testid="cancel-prompt-button" onclick={backToListButtonHandler} disabled={isSaving}>
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
    bind:editingIndex={editingIndex}
    editing={editingIndex != null}
    on:save={handleSaveInput}
    on:cancel={cancelAddInput}
    on:delete={handleDeleteInput}
    onMovePrev={() => { if (editingIndex != null) handleMoveByIndex(editingIndex, 'down'); }}
    onMoveNext={() => { if (editingIndex != null) handleMoveByIndex(editingIndex, 'up'); }}
  />
{/if}

<style>
  @reference "tailwindcss";
  .edit-prompt {
    @apply flex flex-col p-0 h-full gap-4;
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
