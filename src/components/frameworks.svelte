<script lang="ts">
  import { autosize } from '../actions/autosize';
  import { appData, showToast, viewContext } from '../stores';
  import { DEFAULT_FRAMEWORK } from '../data/default-framework';
  import { type FrameworkViewModel, createFrameworkViewModel, toFrameworkDsl } from '../promptops/dsl/framework/renderer';
  import { useNavHistory } from '../actions/navigation';
  
  // Local state
  let frameworkViewModel = $state<FrameworkViewModel>({
    id: '',
    name: '',
    content: '',
    metadata: {}
  });
  let isLoading = $state(false);
  let initialized = $state(false);
  
  // Constants
  const MAX_FRAMEWORK_CONTENT_LENGTH = 20000;

  // Event handler
  let { promptSelectionReset, backToSettings } = $props();

  function validateFrameworkViewModel(vm: FrameworkViewModel, maxLength: number): string | null {
    if (!vm.content.trim()) {
      return 'フレームワーク内容を入力してください';
    }
    if (vm.content.length > maxLength) {
      return `フレームワーク内容は${maxLength.toLocaleString()}文字以内で入力してください`;
    }
    return null;
  }

  // 初期描画時に一度だけ AppData からVMを構築
  $effect(() => {
    if (!initialized && $appData?.frameworks?.[0]?.content) {
      frameworkViewModel = createFrameworkViewModel($appData.frameworks[0].content);
      initialized = true;
    }
  });

  const { backToListHandler } = useNavHistory(() => backToSettings(), {
    getDetailState: () => ({ view: 'settings', screen: 'frameworks' }),
  });

  async function saveFramework(): Promise<void> {
    const validationError = validateFrameworkViewModel(frameworkViewModel, MAX_FRAMEWORK_CONTENT_LENGTH);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    try {
      isLoading = true;

      if ($appData?.frameworks[0]) {
        appData.update((current) => {
          if (!current?.frameworks?.[0]) return current;

          const now = new Date().toISOString();
          const fw = toFrameworkDsl(frameworkViewModel);
          const updatedFrameworks = current.frameworks.map((f, idx) =>
            idx === 0 ? { ...f, content: fw, updatedAt: now } : f
          );

          return { ...current, frameworks: updatedFrameworks };
        });
        
        promptSelectionReset();
        showToast('フレームワークを保存しました', 'success');
      }
    } catch (error) {
      console.error('フレームワークの保存エラー:', error);
      showToast('フレームワークの保存に失敗しました', 'error');
    } finally {
      isLoading = false;
    }
  }

  function resetFramework(): void {
    frameworkViewModel = { ...frameworkViewModel, content: DEFAULT_FRAMEWORK };
    showToast('デフォルトにリセットしました', 'success');
  }
  
  function backToSettingsButtonHandler(): void {
    if (isLoading) return;
    backToListHandler();
  }
</script>

<div class="frameworks">
  <button type="button" class="link-back" data-testid="back-to-list-button" onclick={backToSettingsButtonHandler}>← 設定へ戻る</button>

  <div class="form-group">
    <div class="label-with-reset">
      <label for="frameworkContent">プロンプト生成フレームワーク</label>
      <button class="reset-button" onclick={resetFramework} disabled={isLoading}>リセット</button>
    </div>
    <textarea 
      id="frameworkContent"
      bind:value={frameworkViewModel.content}
      disabled={isLoading}
      use:autosize={{ maxRows: 18, minRows: 13, fixedRows: $viewContext === 'popup' ? 16 : undefined }}
      data-testid="framework-content-input"
      placeholder="フレームワーク情報を入力してください（例：コンテキスト、条件設定、対象など）">
    </textarea>
  </div>
  <div class="input-button-group">
    <button 
      id="saveFramework" 
      class="primary-button" 
      onclick={saveFramework} 
      disabled={isLoading}
      data-testid="save-framework-button"
    >
      {#if isLoading}保存中...{:else}保存{/if}
    </button>
  </div>
</div>

<style>
  @reference "tailwindcss";
  .frameworks {
    @apply flex flex-col p-0 h-full gap-4;
  }

  .form-group { 
    @apply flex-1;
  }
  .label-with-reset {
    @apply flex justify-between items-center;
  }
  .reset-button {
    @apply px-3 py-1 border border-red-500 rounded-md text-sm font-medium text-red-500 bg-transparent cursor-pointer transition-all duration-200;
  }
  .reset-button:hover {
    @apply bg-red-500 text-white -translate-y-px shadow-sm;
  }
  .reset-button:disabled {
    @apply opacity-50 cursor-not-allowed -translate-y-0 shadow-none;
  }
  .reset-button:disabled:hover {
    @apply bg-transparent text-red-500;
  }
</style>
