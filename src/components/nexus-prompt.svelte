<script lang="ts">
  import type { AppData, SnapshotData } from '../types';
  import { onMount } from 'svelte';
  import { STORAGE_KEY, SNAPSHOT_STORAGE_KEY } from '../services/storage';
  import Settings from './settings.svelte'; 
  import Prompts from './prompts.svelte';
  import PromptImprovement from './prompt-improvement.svelte';
  import PromptPlayground from './prompt-playground.svelte';
  import { get } from 'svelte/store';
  import { loadTranslations } from '../lib/translations/translations';
  import { appData, snapshotData, initializeStores, viewContext, isInitialized, toast } from '../stores';
  import '../chrome-mock'; // 開発環境用のChrome APIモック

  // chrome.storage の変更を監視し、UIを同期する
  const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== 'local') return;

    if (changes[STORAGE_KEY]) {
      const newData = changes[STORAGE_KEY].newValue as AppData | null;
      if (newData && JSON.stringify(get(appData)) !== JSON.stringify(newData)) {
        appData.setFromStorage(newData);
      }
    }

    if (changes[SNAPSHOT_STORAGE_KEY]) {
      const newSnapshot = changes[SNAPSHOT_STORAGE_KEY].newValue as SnapshotData | null;
      if (newSnapshot && JSON.stringify(get(snapshotData)) !== JSON.stringify(newSnapshot)) {
        snapshotData.setFromStorage(newSnapshot);
      }
    }
  };

  onMount(() => {
    loadTranslations("ja", "/"); 
    initializeStores();

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  });

  // 初期化完了後に UI コンテキストを一度だけ判定
  let contextSet = $state(false);
  $effect(() => {
    if ($isInitialized && !contextSet) {
      try {
        const isPopupView = (() => {
          try {
            const views = (chrome.extension as any)?.getViews?.({ type: 'popup' }) ?? [];
            return Array.isArray(views) && views.includes(window as any);
          } catch {
            return false;
          }
        })();

        viewContext.set(isPopupView ? 'popup' : 'sidepanel');
      } catch (e) {
        console.warn('UIコンテキスト判定エラー。ポップアップとして扱います。', e);
        viewContext.set('popup');
      } finally {
        contextSet = true;
      }
    }
  });

  async function switchTab(tabName: string): Promise<void> {
    snapshotData.update((current: SnapshotData | null) => {
      if (!current) return null;
      return { ...current, activeTab: tabName as 'main' | 'prompt-improvement' | 'prompts' | 'settings' };
    });
  }

  async function resetPromptSelection(): Promise<void> {
    snapshotData.update((current: SnapshotData | null) => current ? { ...current, selectedPromptId: '' } : null);
  }

  async function handlePromptSelectionReset(): Promise<void> {
    await resetPromptSelection();
  }
</script>

<div class={`container nexus-prompt-base ${$viewContext === 'popup' ? 'popup-view' : ''}`} id="nexus-prompt" data-testid="nexus-prompt">
  <!-- タブナビゲーション -->
  <div class="tabs">
    {#if $snapshotData}
      <button 
        class="tab-button {$snapshotData.activeTab === 'main' ? 'active' : ''}" 
        onclick={() => switchTab('main')}>
        メイン画面
      </button>
      <button 
        class="tab-button {$snapshotData.activeTab === 'prompt-improvement' ? 'active' : ''}" 
        onclick={() => switchTab('prompt-improvement')}>
        プロンプト改善
      </button>
      <button 
        class="tab-button {$snapshotData.activeTab === 'prompts' ? 'active' : ''}" 
        onclick={() => switchTab('prompts')}>
        LLMプロンプト管理
      </button>
      <button 
        class="tab-button {$snapshotData.activeTab === 'settings' ? 'active' : ''}" 
        onclick={() => switchTab('settings')}>
        設定
      </button>
    {/if}
  </div>

  {#if $isInitialized && $appData && $snapshotData && $viewContext}
    <!-- メイン画面 -->
    {#if $snapshotData.activeTab === 'main'}
    <div id="main" class="tab-content active">
      <PromptPlayground />
    </div>
    {/if}

    <!-- プロンプト改善 -->
    {#if $snapshotData.activeTab === 'prompt-improvement'}
    <div id="main" class="tab-content active">
      <PromptImprovement switchTab={switchTab} selectedPromptIdFromParent={$snapshotData?.selectedPromptId || ''} />
    </div>
    {/if}

    <!-- LLMプロンプト管理 -->
    {#if $snapshotData.activeTab === 'prompts'}
    <div id="prompts" class="tab-content active">
      <Prompts promptSelectionReset={handlePromptSelectionReset} />
    </div>
    {/if}

    <!-- 設定（APIキー） -->
    {#if $snapshotData.activeTab === 'settings'}
    <div id="settings" class="tab-content active">
      <Settings promptSelectionReset={handlePromptSelectionReset}/>
    </div>
    {/if}
  {/if}
</div>

<!-- グローバルメッセージ表示エリア -->
{#if $toast?.visible}
<div id="messageArea" class="message-area {$toast.type}" data-testid="message-area" style="display: block;">
  {$toast.text}
</div>
{/if}

<style>
   @reference "tailwindcss";
  .container {
    @apply flex flex-col h-full bg-white;
  }
  @media (min-width: 64rem) {
    .container {
        @apply max-w-full;
    }
  }
  @media (min-width: 48rem) {
    .container {
        @apply max-w-full;
    }
  }
  @media (min-width: 40rem) {
    .container {
        @apply max-w-full;
    }
  }

  .tabs {
    @apply flex bg-[#f8f9fa] border-b border-[#dee2e6] p-0;
  }
  
  .tab-button {
    @apply flex-1 px-4 py-3 border-0 bg-transparent cursor-pointer text-[14px] text-[#495057] transition-all duration-300 border-b-[3px] border-transparent;
  }
  
  .tab-button:hover {
    @apply bg-[#e9ecef] text-[#212529];
  }
  
  .tab-button.active {
    @apply text-[#007bff] border-b-[#007bff] bg-white;
  }
  
  .tab-content {
    @apply hidden flex-1 p-5 overflow-y-auto;
  }
  
  .tab-content.active {
    @apply block;
  }

  /* Toast message: display \n as line breaks */
  .message-area {
    white-space: pre-line;
  }
</style>
