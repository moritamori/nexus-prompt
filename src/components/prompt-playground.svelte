<script lang="ts">
  import { appData, showToast } from '../stores';
  import { autosize } from '../actions/autosize';
  import { viewContext } from '../stores';
  import { copyToClipboard } from '../utils/copy-to-clipboard';
  import { caluculateComplexity } from '../utils/input-complexity-calculator';
  import type { Prompt } from '../types';
  import { hasRemainingPlaceholders } from '../promptops/dsl/prompt/linter';
  import { buildPrompt } from '../promptops/dsl/prompt/builder';
  import PromptPlaygroundInput from './prompt-playground-input.svelte';

  // constants
  const ALIGN_METHOD_FULL = 'full' as const;
  const ALIGN_METHOD_LEFT_RIGHT = 'left_right' as const;
  const ALIGN_METHOD_TOP_BOTTOM = 'top_bottom' as const;
  const ALIGN_METHODS = [
    ALIGN_METHOD_FULL,
    ALIGN_METHOD_LEFT_RIGHT,
    ALIGN_METHOD_TOP_BOTTOM
  ] as const;

  const ALIGN_METHOD_TO_PANEL_CLASS_INDEX = 0;
  const INPUT_BUTTON_GROUP_CLASS = 'js-input-button-group';
  type AlignMethod = typeof ALIGN_METHODS[number];
  const ALIGN_METHOD_TO_CLASSES = new Map<AlignMethod, readonly [panelClass: string]>([
    [ALIGN_METHOD_FULL, ['js-main-panel']],
    [ALIGN_METHOD_LEFT_RIGHT, ['js-right-panel']],
    [ALIGN_METHOD_TOP_BOTTOM, ['js-bottom-panel']],
  ] as const);
  const COMPLEX_CLITELIA = 2 as const;
  const COMPLEX_CLITELIA2 = 4 as const;
  const USER_PROMPT_MIN_ROWS = 15 as const;
  const INPUT_STRING_MIN_ROWS = 2 as const;

  // Local state
  let selectedModelId = $state('');
  let isLoading = $state(false);
  let userPrompt = $state('');
  let recordInputs = $state<Record<string, unknown>>({});
  let invalidInputs = $state<Record<string, boolean>>({});

  // Derived
  const promptsOrdered = $derived(
    [...($appData?.prompts ?? [])].sort((a, b) => a.order - b.order)
  );

  const selectedPrompt = $derived.by((): Prompt | undefined => {
    const prompts = $appData?.prompts || [];
    return prompts.find((p) => p.id === selectedModelId);
  });

  const complexity = $derived.by(() => {
    return caluculateComplexity(selectedPrompt?.content.inputs || []);
  });

  const userPromptRows = $derived.by(() => {
    return USER_PROMPT_MIN_ROWS;
  });

  const inputStringRows = $derived.by(() => {
    if (complexity > COMPLEX_CLITELIA2) {
      return INPUT_STRING_MIN_ROWS;
    } else if (complexity > COMPLEX_CLITELIA) {
      return INPUT_STRING_MIN_ROWS+3;
    } else {
      return INPUT_STRING_MIN_ROWS+2;
    }
  });

  const alignMethod = $derived.by((): AlignMethod => {
    if (complexity > COMPLEX_CLITELIA) {
      return ALIGN_METHOD_LEFT_RIGHT;
    } else if (complexity === 0) {
      return ALIGN_METHOD_FULL;
    } else {
      return ALIGN_METHOD_TOP_BOTTOM;
    }
  });

  function handleChildInputChange(name: string, value: string): void {
    recordInputs = { ...recordInputs, [name]: value };
    if (invalidInputs[name]) {
      invalidInputs = { ...invalidInputs, [name]: false };
    }
  }

  // セレクト変更時に該当プロンプトのテンプレートをコピー
  $effect(() => {
    const id = selectedModelId;
    if (!id) {
      userPrompt = '';
      return;
    }
    if (!selectedPrompt) return;
    const template = selectedPrompt.content.template ?? '';

    // Update userPrompt
    if (template) {
      userPrompt = template;
    }
  });

  function handlePromptSelectChange(): void {
    if (!selectedPrompt) return;
    const validNames = new Set((selectedPrompt.content.inputs || []).map((i) => i.name));
    const nextInputs: Record<string, unknown> = {};
    validNames.forEach((name) => {
      if (Object.prototype.hasOwnProperty.call(recordInputs, name)) {
        nextInputs[name] = recordInputs[name];
      } else {
        nextInputs[name] = '';
      }
    });
    recordInputs = nextInputs;
    invalidInputs = {};
  }

  function copyUserPrompt(): void {
    if (!userPrompt.trim()) {
      showToast('コピーする内容がありません', 'error');
      return;
    }
    const textarea = document.getElementById('promptSelect') as HTMLTextAreaElement;
    copyToClipboard(userPrompt, textarea, showToast);
  }

  function buildUserPrompt(): void {
    if (!selectedPrompt) return;
    let hasError = false;
    const nextInvalid: Record<string, boolean> = {};
    selectedPrompt.content.inputs.forEach((input) => {
      const val = recordInputs[input.name];
      const invalid = Boolean(input.required && (val === '' || val === undefined || val === null));
      nextInvalid[input.name] = invalid;
      if (invalid) hasError = true;
    });
    invalidInputs = nextInvalid;
    if (hasError) {
      showToast('必須項目が入力されていません', 'error');
      return 
    }

    const builtPrompt = buildPrompt(userPrompt, recordInputs);
    if (hasRemainingPlaceholders(builtPrompt)) {
      showToast('プレースホルダーが残っています', 'error');
      return;
    }
    copyToClipboard(builtPrompt, null, showToast);
  }
</script>

<div 
  class="prompt-playground-container"
  class:align-top-bottom={alignMethod === ALIGN_METHOD_TOP_BOTTOM}>
  <div class="top-layout">
    <div class="form-group">
      <label for="promptSelect">登録済みLLMプロンプト</label>
      <select 
        id="promptSelect" 
        data-testid="prompt-select"
        bind:value={selectedModelId}
        onchange={handlePromptSelectChange}
        disabled={isLoading}>
        <option value="">選択してください</option>
        {#each promptsOrdered as prompt}
          <option value={prompt.id}>
            {prompt.content.name || prompt.content.template.substring(0, 30) + '...'}
          </option>
        {/each}
      </select>
    </div>
  </div>
  <div class="main-layout">
    <div class="main-panel {ALIGN_METHOD_TO_CLASSES.get(ALIGN_METHOD_FULL)?.[ALIGN_METHOD_TO_PANEL_CLASS_INDEX]}" 
         class:full={alignMethod === ALIGN_METHOD_FULL}
         class:top-bottom={alignMethod === ALIGN_METHOD_TOP_BOTTOM}>
      <div class="form-group">
        <label for="userPrompt">実行したいLLMプロンプト</label>   
        {#if alignMethod === ALIGN_METHOD_TOP_BOTTOM}
          <textarea 
            id="userPrompt"
            data-testid="user-prompt-input"
            bind:value={userPrompt}
            disabled={isLoading}
            use:autosize={{ maxRows: 20, minRows: 10, fixedRows: $viewContext === 'popup' ? 8 : undefined }}
            placeholder="登録済みLLMプロンプトを選択後、プロンプトが表示されます。適宜編集してください。">
          </textarea>
        {:else}
          <textarea 
            id="userPrompt"
            data-testid="user-prompt-input"
            bind:value={userPrompt}
            disabled={isLoading}
            use:autosize={{ maxRows: 20, minRows: 10, fixedRows: $viewContext === 'popup' ? userPromptRows : undefined }}
            placeholder="登録済みLLMプロンプトを選択後、プロンプトが表示されます。適宜編集してください。">
          </textarea>
        {/if}
      </div>
    </div>
    {#if alignMethod === ALIGN_METHOD_LEFT_RIGHT}
      <div class="right-panel {ALIGN_METHOD_TO_CLASSES.get(ALIGN_METHOD_LEFT_RIGHT)?.[ALIGN_METHOD_TO_PANEL_CLASS_INDEX]}">
        <div class="form-group">
          {#each selectedPrompt?.content.inputs || [] as input}
            <PromptPlaygroundInput 
              {input} 
              {inputStringRows} 
              value={recordInputs[input.name] as string}
              onchange={handleChildInputChange}
              isInvalid={invalidInputs[input.name] === true}
            />
          {/each}
        </div>
      </div>
    {:else if alignMethod === ALIGN_METHOD_TOP_BOTTOM}
      <div class="bottom-panel top-bottom {ALIGN_METHOD_TO_CLASSES.get(ALIGN_METHOD_TOP_BOTTOM)?.[ALIGN_METHOD_TO_PANEL_CLASS_INDEX]}">
        <div class="form-group">
          {#each selectedPrompt?.content.inputs || [] as input}
            <PromptPlaygroundInput 
              {input} 
              {inputStringRows} 
              value={recordInputs[input.name] as string}
              onchange={handleChildInputChange}
              isInvalid={invalidInputs[input.name] === true}
            />
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <div class="fotter-layout">
    <div class="input-button-group {INPUT_BUTTON_GROUP_CLASS}">
      <a href="https://www.buymeacoffee.com/nexus.prompt" target="_blank" rel="noopener noreferrer" title="この拡張機能の開発をサポート">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
        <span>Support this extension</span>
      </a>

      {#if alignMethod === ALIGN_METHOD_FULL}
        <button id="copyButton" class="secondary-button" onclick={copyUserPrompt}>コピー</button>
      {:else}
        <button id="buildPromptButton" class="secondary-button" onclick={buildUserPrompt}>差し込み後にコピー</button>
      {/if}
    </div>
  </div>
</div>

<style>
  @reference "tailwindcss";
  .top-layout {
    @apply justify-start border-b border-gray-200 mb-2;
  }
  .main-layout {
    @apply mb-3 flex flex-row gap-2 h-full;
  }
  .prompt-playground-container {
    @apply flex flex-col p-0 h-full relative;
  }

  .prompt-playground-container.align-top-bottom .main-layout {
    @apply flex-col;
  }

  .main-panel, 
  .right-panel,
  .bottom-panel {
    @apply basis-0 min-w-0 flex-1 flex flex-col gap-3;
  }
  .main-panel.full {
    @apply w-full;
  }
  .right-panel {
    @apply overflow-y-auto max-h-[364px]; 
  }

  @media (max-width: 768px) {
    .main-layout {
      @apply flex-col;
    }
    .right-panel {
      @apply overflow-y-visible max-h-none;
    }
    .main-panel, .right-panel, .bottom-panel {
      @apply w-full;
    }
  } 

  .input-button-group { 
    @apply flex items-center justify-between text-sm w-full;
  }
  .input-button-group a { 
    @apply flex items-center gap-1.5 text-gray-500 no-underline transition-colors;
  }
  .input-button-group a:hover { 
    @apply text-blue-500;
  }
  .input-button-group svg { @apply w-4 h-4; }
</style>
