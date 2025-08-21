<script lang="ts">
  import { storageService } from '../services/storage';
  import { showToast, snapshotData } from '../stores';
  import Frameworks from './frameworks.svelte';
  import { useForwardToScreen } from '../actions/navigation';
  import DataManagement from './data-management.svelte';

  // Local state
  let geminiApiKey = $state('');
  let openaiApiKey = $state('');
  let anthropicApiKey = $state('');
  let isLoading = $state(false);
  let initialized = $state(false);
  
  // Constants
  const MAX_API_KEY_LENGTH = 300;

  // Event handler
  let { promptSelectionReset } = $props();

  // Services
  $effect(() => {
    (async () => {
      if (initialized) return;
      try {
        geminiApiKey = (await storageService.getApiKey('Gemini')) || '';
        openaiApiKey = (await storageService.getApiKey('OpenAI')) || '';
        anthropicApiKey = (await storageService.getApiKey('Anthropic')) || '';
      } catch (error) {
        console.error('APIキーの読み込みに失敗:', error);
      } finally {
        initialized = true;
      }
    })();
  });

  function validateApiKey(key: string, maxLen: number): string | null {
    if (!key.trim()) return 'APIキーを入力してください';
    if (key.length > maxLen) return `APIキーは${maxLen}文字以内で入力してください`;
    return null;
  }

  type ProviderName = 'Gemini' | 'OpenAI' | 'Anthropic';
  async function saveApiKeyFor(providerName: ProviderName): Promise<void> {
    const apiKey = providerName === 'Gemini' ? geminiApiKey
      : providerName === 'OpenAI' ? openaiApiKey
      : anthropicApiKey;

    const error = validateApiKey(apiKey, MAX_API_KEY_LENGTH);
    if (error) {
      showToast(error, 'error');
      return;
    }

    try {
      isLoading = true;
      const success = await storageService.setApiKey(providerName, apiKey);
      showToast(success ? 'APIキーを保存しました' : 'APIキーの保存に失敗しました', success ? 'success' : 'error');
    } catch (error) {
      console.error('APIキーの保存中に予期せぬエラー:', error);
      showToast('APIキーの保存に失敗しました', 'error');
    } finally {
      isLoading = false;
    }
  }

  // 履歴の「進む」で settings配下のサブ画面を復元
  useForwardToScreen((screen: string) => {
    if (screen === 'frameworks' || screen === 'data-management') {
      snapshotData.update(current => current ? { ...current, activeScreen: screen as any } : null);
    }
  }, 'settings');
</script>

<div class="settings-container">
  {#if $snapshotData?.activeScreen === null}
    <!-- APIキーセクション -->
    <div class="setting-api-key-section">
      <div class="form-group">
        <label for="geminiApiKey">Gemini APIキー</label>
        <div class="input-button-group">
          <input 
            type="password" 
            id="geminiApiKey"
            bind:value={geminiApiKey}
            disabled={isLoading}
            data-testid="gemini-api-key-input"
            placeholder="APIキーを入力してください">
          <button
            id="saveApiKey"
            class="primary-button"
            onclick={() => saveApiKeyFor('Gemini')}
            data-testid="save-gemini-api-key-button"
            disabled={isLoading}>{isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      <div class="form-group">
        <label for="openaiApiKey">OpenAI APIキー</label>
        <div class="input-button-group">
          <input 
            type="password" 
            id="openaiApiKey"
            bind:value={openaiApiKey}
            disabled={isLoading}
            data-testid="openai-api-key-input"
            placeholder="APIキーを入力してください">
          <button
            id="saveApiKey"
            class="primary-button"
            onclick={() => saveApiKeyFor('OpenAI')}
            data-testid="save-openai-api-key-button"
            disabled={isLoading}>{isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      <div class="form-group">
        <label for="anthropicApiKey">Anthropic APIキー</label>
        <div class="input-button-group">
          <input 
            type="password" 
            id="anthropicApiKey"
            bind:value={anthropicApiKey}
            disabled={isLoading}
            data-testid="anthropic-api-key-input"
            placeholder="APIキーを入力してください">
          <button
            id="saveApiKey"
            class="primary-button"
            onclick={() => saveApiKeyFor('Anthropic')}
            data-testid="save-anthropic-api-key-button"
            disabled={isLoading}>{isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>

    <!-- データ管理セクション（導線） -->
    <div class="data-management-section">
      <div class="data-management-header">
        <h3>データ管理</h3>
        <span class="inline-description">LLMプロンプトのエクスポート/インポートはこちらから行えます。</span>
      </div>
      <a
        href="#data-management"
        class="text-blue-500"
        data-testid="open-data-management-link"
        onclick={(e) => { e.preventDefault(); snapshotData.update(current => current ? { ...current, activeScreen: 'data-management' } : null); }}
      >
        データ管理を開く
      </a>
    </div>

    <!-- フレームワークセクション -->
    <div class="frameworks-section">
      <div class="frameworks-header">
        <h3>フレームワーク</h3>
        <span class="inline-description">フレームワークの編集はこちらから行えます。</span>
      </div>
      <a
        href="#frameworks"
        class="text-blue-500"
        data-testid="open-frameworks-link"
        onclick={(e) => { e.preventDefault(); snapshotData.update(current => current ? { ...current, activeScreen: 'frameworks' } : null); }}
      >
        フレームワーク管理を開く
      </a>
    </div>

    <div class="feedback-link">
      <p>不具合の報告や機能のご要望は、ぜひこちらからお寄せください。</p>
      <a href="https://docs.google.com/forms/d/1GnBes2W30efxIYPVCICifyJRf6Mm1oFZf9zwV6tXcT8/viewform" target="_blank" rel="noopener noreferrer">フィードバックを送る</a>
    </div>
  {:else if $snapshotData?.activeScreen === 'frameworks'}
    <Frameworks promptSelectionReset={promptSelectionReset} backToSettings={() => snapshotData.update(current => current ? { ...current, activeScreen: null } : null)} />
  {:else if $snapshotData?.activeScreen === 'data-management'}
    <DataManagement backToSettings={() => snapshotData.update(current => current ? { ...current, activeScreen: null } : null)} />
  {/if}
</div>

<style>
  @reference "tailwindcss";
  .setting-api-key-section .form-group label {
    @apply mt-2;
  }
  .settings-container {
    @apply flex flex-col p-0;
  }
  .frameworks-section,
  .data-management-section { 
    @apply mt-6 pt-4 border-t border-gray-200;
  }
  .frameworks-section h3,
  .data-management-section h3 { 
    @apply text-lg font-semibold text-gray-900;
  }
  .frameworks-header {
    @apply flex items-center gap-3 mb-2;
  }
  .data-management-header {
    @apply flex items-center gap-3 mb-2; /* 見出しより少し間を開けて右側に配置 */
  }
  .inline-description {
    @apply text-xs text-gray-600; /* 見出しより小さい文字 */
  }

  .feedback-link {
    @apply mt-4 text-center text-xs text-gray-600;
  }
  .feedback-link p {
    @apply mb-2;
  }
  .feedback-link a {
    @apply text-blue-500 no-underline;
  }
  .feedback-link a:hover {
    @apply underline;
  }
</style> 