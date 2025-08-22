<script lang="ts">
  import type { ModelInfo } from '../types';
  import { appData, snapshotData, showToast } from '../stores';
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { autosize } from '../actions/autosize';
  import { copyToClipboard } from '../utils/copy-to-clipboard';
  import { viewContext } from '../stores';
  import { scrollToBottom } from '../actions/window';
  import { createSnapshotManager } from '../actions/snapshot';

  // Event handler, Props
  let { switchTab, selectedPromptIdFromParent } = $props();

  // Local state
  const userPrompt = writable($snapshotData?.promptImprovement?.userPrompt || '');
  const selectedPromptId = writable(selectedPromptIdFromParent);
  const selectedModelId = writable($snapshotData?.promptImprovement?.selectedModelId || '');
  const resultArea = writable($snapshotData?.promptImprovement?.resultArea || '');
  let isLoading = $state(false);

  // Derived
  const promptsOrdered = $derived(
    [...($appData?.prompts ?? [])].sort((a, b) => a.order - b.order)
  );

  // 親のスナップショットから渡された選択値をローカルストアに同期
  $effect(() => {
    selectedPromptId.set(selectedPromptIdFromParent);
  });

  onMount(async () => {
    document.addEventListener('visibilitychange', snapshotManager.handleVisibilityChange);
  });

  async function improvePrompt(): Promise<void> {
    if (!$userPrompt.trim() || !$selectedPromptId) {
      showToast('プロンプトとLLMプロンプトの両方を入力・選択してください', 'error');
      return;
    }

    if (!$selectedModelId) {
      showToast('実行モデルを選択してください', 'error');
      return;
    }

    const selectElement = document.getElementById('modelSelect') as HTMLSelectElement;
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const selectedProviderName = selectedOption.getAttribute('data-provider-name') || '';
    const selectedModelName = selectedOption.getAttribute('data-model-name') || '';

    const selectedPrompt = $appData?.prompts?.find(p => p.id === $selectedPromptId);

    if (!selectedPrompt) {
      showToast('選択されたプロンプトが見つかりません', 'error');
      return;
    }

    try {
      isLoading = true;
      showToast('プロンプトを改善中です...', 'info');

      const response = await chrome.runtime.sendMessage({
        type: 'IMPROVE_PROMPT',
        payload: {
          providerName: selectedProviderName,
          modelName: selectedModelName,
          userPrompt: $userPrompt,
          selectedPrompt: selectedPrompt.content,
          frameworkContent: $appData?.frameworks[0].content.content
        }
      });

      if (response.success) {
        const result = response.data;
        resultArea.set(result);
        snapshotData?.update(current => current ? {
          ...current,
          promptImprovement: {
            ...current.promptImprovement,
            userPrompt: $userPrompt,
            selectedPromptId: $selectedPromptId,
            resultArea: result,
            selectedModelId: $selectedModelId
          }
        } : current);
        showToast('プロンプトの改善が完了しました', 'success');
        if ($viewContext === 'sidepanel') {
          scrollToBottom();
        }
      } else {
        console.warn(response.error);
        if (response.error.includes('APIキーが設定されていません')) {
          showToast('APIキーを設定してください', 'error');
          switchTab('settings');
          try {
            snapshotData?.update(current => current ? { ...current, activeTab: 'settings' } : current);
          } catch (e) {
            // noop
          }
        } else if (response.error.includes('fetch')) {
          showToast('ネットワーク接続に問題があるようです。接続を確認してください。', 'error');
        } else {
          showToast(`エラー: ${response.error}`, 'error');
        }
      }
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      showToast('プロンプトの改善中に予期せぬエラーが発生しました。', 'error');
    } finally {
      isLoading = false;
    }
  }

  function copyResult(): void {
    if (!$resultArea.trim()) {
      showToast('コピーする内容がありません', 'error');
      return;
    }

    const textarea = document.getElementById('resultArea') as HTMLTextAreaElement;
    copyToClipboard($resultArea, textarea, showToast);
  }

  function resetFields(): void {
    userPrompt.set('');
    resultArea.set('');
    selectedPromptId.set('');

    snapshotData?.update(current => current ? { ...current, userPrompt: '', selectedPromptId: '', resultArea: '' } : current);
    showToast('フィールドをリセットしました', 'success');
  }

  // ストア更新時に自動保存されるため、明示保存は不要
  const saveSnapshot = async () => {
    snapshotData?.update(current => current ? {
      ...current,
      promptImprovement: {
        ...current.promptImprovement,
        userPrompt: $userPrompt,
        selectedPromptId: $selectedPromptId,
        resultArea: $resultArea,
        selectedModelId: $selectedModelId
      }
    } : current);
    snapshotManager.hasPendingChanges = false;
  };

  // スナップショット管理の初期化
  const snapshotManager = createSnapshotManager(saveSnapshot);

  onDestroy(() => {
    document.removeEventListener('visibilitychange', snapshotManager.handleVisibilityChange);
    snapshotManager.cleanup();
  });
</script>

<div class="improvement-container">
  <div class="top-layout">
    <div class="form-group">
      <select 
        id="modelSelect" 
        data-testid="model-select"
        class="model-select"
        bind:value={$selectedModelId}
        oninput={snapshotManager.handleInput}
        disabled={isLoading}>
        <option value="">実行モデルを選択してください</option>
        {#each $appData?.providers || [] as provider}
          {#each provider?.models.filter((model: ModelInfo) => model.enabled) as model}
            <option value={model.id} data-provider-name={provider.name} data-model-name={model.name}>
              {provider.displayName} - {model.name}
            </option>
          {/each}
        {/each}
      </select>
    </div>
  </div>
  <div class="main-layout">
    <div class="left-panel">
      <div class="form-group">
        <div class="label-with-reset">
          <label for="userPrompt">改善したいプロンプト</label>
          <button class="reset-button" onclick={resetFields} disabled={isLoading}>リセット</button>
        </div>
        <textarea 
          id="userPrompt"
          data-testid="user-prompt-input"
          bind:value={$userPrompt}
          disabled={isLoading}
          use:autosize={{ fixedRows: 13 }}
          oninput={snapshotManager.handleInput}
          placeholder="改善したいプロンプトを入力してください">
        </textarea>
      </div>
      <div class="form-group">
        <label for="promptSelect">改善に使用する登録済みLLMプロンプト</label>
        <select 
          id="promptSelect" 
          data-testid="prompt-select"
          bind:value={$selectedPromptId}
          disabled={isLoading}
          onchange={snapshotManager.handleInput}>
          <option value="">選択してください</option>
          {#each promptsOrdered as prompt}
            <option value={prompt.id}>
              {prompt.content.name || prompt.content.template.substring(0, 30) + '...'}
            </option>
          {/each}
        </select>
      </div>
      <div class="input-button-group">
        <button id="applyButton" data-testid="apply-button" class="primary-button" onclick={improvePrompt} disabled={isLoading}>
          {#if isLoading}処理中...{:else}適用{/if}
        </button>
      </div>
    </div>
    <div class="right-panel">
      <div class="form-group ">
        <label for="resultArea" class="label-with-improved-prompt">改善されたプロンプト</label>
        <textarea 
          id="resultArea"
          data-testid="result-area"
          class="result-area"
          bind:value={$resultArea}
          use:autosize={{ fixedRows: 17 }}
          oninput={snapshotManager.handleInput}
          placeholder="改善結果がここに表示されます">
        </textarea>
      </div>

      <div class="input-button-group">
        <button id="copyButton" class="secondary-button" onclick={copyResult} disabled={!resultArea}>コピー</button>
      </div>
    </div>
  </div>
</div>

<style>
  @reference "tailwindcss";
  .top-layout {
    @apply justify-start border-b border-gray-200 mb-2;
  }
  .top-layout .form-group { 
    @apply min-w-[300px]; 
  }
  .improvement-container {
    @apply flex flex-col p-0 h-full relative;
  }

  @media (min-width: 768px) {
    .main-layout {
      @apply flex flex-row gap-5 h-full;
    }
  }
  @media (max-width: 768px) {
    .main-layout {
      @apply flex flex-row h-full;
    }
  }

  .left-panel, .right-panel {
    @apply basis-0 min-w-0 flex-1 flex flex-col gap-3;
  }

  @media (max-width: 768px) {
    .main-layout {
      @apply flex-col;
    }
    .left-panel, .right-panel {
      @apply w-full;
    }
  } 

  .left-panel .form-group textarea,
  .right-panel .form-group textarea {
    @apply flex-1; 
  }

  .model-select { 
    @apply p-0.5;
  }

  .label-with-improved-prompt {
    @apply p-[5];
  }
</style>
