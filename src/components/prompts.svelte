<script lang="ts">
  import { storageService } from '../services/storage';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { appData, snapshotData, viewContext, isInitialized, showToast, capabilities, entitlements } from '../stores';
  import EditPrompt from './edit-prompt/detail.svelte';
  import { useForwardToDetail } from '../actions/navigation';
  import { movePrompt } from '../actions/prompts';
  import { FileImportExportService } from '../services/file-import-export';

  // Local state
  let view = $state<'list' | 'edit'>('list');
  let editingPromptId = $state<string | null>(null);
  let deletingIds = $state<Set<string>>(new Set());
  let handledSidepanelInit = $state(false);
  let selectedIds = $state<Set<string>>(new Set());
  let fileInputEl = $state<HTMLInputElement | null>(null);
  const importExportService = new FileImportExportService();
  
  // Event handler
  let { promptSelectionReset } = $props();

  // Derived
  const promptsOrdered = $derived(
    [...($appData?.prompts ?? [])].sort((a, b) => a.order - b.order)
  );

  // Derived: 環境フラグはストアから参照
  const canUseSidePanel = $derived($capabilities.canUseSidePanel);

  // Constants
  const MAX_PROMPT_COUNT = 20;

  // 親の onMount 後に viewContext が設定されるため、変化を一度だけ拾う
  $effect(() => {
    if ($isInitialized && !handledSidepanelInit && $viewContext === 'sidepanel' && $snapshotData?.editPrompt?.id) {
      handledSidepanelInit = true;
      editingPromptId = $snapshotData.editPrompt.id || null;
      view = 'edit';
      (async () => {
        try {
          await storageService.saveEditPrompt(null);
        } finally {
          snapshotData.update(current => current ? { ...current, editPrompt: { id: null } } : null);
        }
      })();
    }
  });

  function openEditor(promptId: string | null = null): void {
    editingPromptId = promptId;
    view = 'edit';
  }

  async function openInSidePanel(targetId: string | null): Promise<void> {
    // サイドパネル内 または API 不可ならフォールバック
    if ($viewContext === 'sidepanel' || !canUseSidePanel) {
      openEditor(targetId);
      return;
    }

    try {
      await storageService.saveActiveTab('prompts');
      await storageService.saveEditPrompt(targetId);

      const currentWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: currentWindow.id! });
      // ポップアップとして開かれている場合はクローズ
      try {
        const isPopup = Boolean((chrome as any)?.extension?.getViews?.({ type: 'popup' })?.includes(window as any));
        if (isPopup) {
          window.close();
        }
      } catch {
        // no-op
      }
    } catch {
      // 何らかの理由でサイドパネルが開けない場合はフォールバック
      openEditor(targetId);
    }
  }

  // 新規作成時にサイドパネルでエディタを開く
  async function openNewEditorInSidePanel(): Promise<void> {
    if ($entitlements.isFree && promptsOrdered.length >= MAX_PROMPT_COUNT) {
      showToast(`フリープランではプロンプトは${MAX_PROMPT_COUNT}個までしか作成できません。プランをアップグレードしてください。`, 'error');
      return;
    }
    await openInSidePanel(null);
  }

  async function deletePrompt(promptId: string): Promise<void> {
    if (confirm('このプロンプトを削除してもよろしいですか？')) {
      try {
        deletingIds.add(promptId);
        deletingIds = new Set(deletingIds);

        appData.update(current => {
          if (!current) return null;
          // 削除対象のプロンプトのorderを取得
          const deletedPrompt = current.prompts.find(p => p.id === promptId);
          const deletedOrder = deletedPrompt?.order || 0;
          
          // プロンプトを削除
          current.prompts = current.prompts.filter(p => p.id !== promptId);
          
          // 削除されたorder以降のプロンプトのorderを-1する
          current.prompts.forEach(prompt => {
            if (prompt.order > deletedOrder && prompt.order > 1) {
              prompt.order -= 1;
            }
          });
          return current;
        });
        
        showToast('プロンプトを削除しました', 'success');
        promptSelectionReset();
      } catch (error) {
        console.error('プロンプト削除エラー:', error);
        showToast('プロンプトの削除に失敗しました', 'error');
      } finally {
        deletingIds.delete(promptId);
        deletingIds = new Set(deletingIds);
      }
    }
  }

  function toggleSelect(id: string, checked: boolean): void {
    if (checked) {
      selectedIds.add(id);
    } else {
      selectedIds.delete(id);
    }
    // trigger reactivity
    selectedIds = new Set(selectedIds);
  }

  async function handleDiffExport(): Promise<void> {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('エクスポート対象のプロンプトを選択してください。', 'info');
      return;
    }
    try {
      const zipBytes = await importExportService.export(ids);
      // ZIPダウンロードの実行（ArrayBufferに切り出して型互換にする）
      const arrayBuffer = zipBytes.buffer.slice(
        zipBytes.byteOffset,
        zipBytes.byteOffset + zipBytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prompts-diff.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('差分エクスポートを完了しました。', 'success');
    } catch (e) {
      console.error('差分エクスポートに失敗:', e);
      showToast('差分エクスポートに失敗しました。', 'error');
    }
  }

  async function handleDiffImportFromFile(file: File): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      await importExportService.import(arrayBuffer, $entitlements.plan, true);
      showToast('差分インポートを完了しました。', 'success');
      // インポート後は選択をクリア
      selectedIds.clear();
      selectedIds = new Set(selectedIds);
    } catch (e) {
      console.error('差分インポートに失敗:', e);
      showToast('差分インポートに失敗しました。', 'error');
    }
  }

  function triggerDiffImport(): void {
    fileInputEl?.click();
  }

  function backToList(): void {
    view = 'list';
    editingPromptId = null;
  }

  useForwardToDetail((id: string | null) => {
    openEditor(id ?? null);
  });
</script>

<div class="prompts-container">
  {#if view === 'list'}
    <div in:fade={{ duration: 200 }}>
      <div class="prompt-header">
        <button id="newPromptButton" class="primary-button" data-testid="new-prompt-button" onclick={openNewEditorInSidePanel}>新規作成</button>
        <div class="diff-actions">
          <button class="secondary-button" onclick={triggerDiffImport}>差分インポート</button>
          <button class="secondary-button" onclick={handleDiffExport} disabled={selectedIds.size === 0}>差分エクスポート</button>
          <input bind:this={fileInputEl} type="file" accept=".zip" class="hidden" onchange={(e) => {
            const files = (e.target as HTMLInputElement)?.files;
            if (files && files[0]) handleDiffImportFromFile(files[0]);
            if (fileInputEl) fileInputEl.value = '';
          }} />
        </div>
      </div>
      <div id="promptList" data-testid="prompt-list" class="prompt-list {$viewContext === 'popup' ? 'popup-view' : ''}">
        {#each promptsOrdered as prompt (prompt.id)}
        <div class="prompt-item js-prompt-item" data-testid="prompt-item" in:fly={{ y: 20, duration: 250 }} animate:flip>
          <div class="prompt-info">
            <h4>
              <input id={`sel-${prompt.id}`} type="checkbox" class="mr-1" checked={selectedIds.has(prompt.id)} onchange={(e) => toggleSelect(prompt.id, (e.target as HTMLInputElement).checked)} />
              <label for={`sel-${prompt.id}`} class="cursor-pointer select-none">{prompt.content.name}</label>
            </h4>
            <p>{prompt.content.template.substring(0, 43)}...</p>
          </div>
          <div class="prompt-actions">
            <button class="sort-button" aria-label="上へ" title="上へ" onclick={() => movePrompt(prompt.id, 'up')} disabled={promptsOrdered[0]?.id === prompt.id}>↑</button>
            <button class="sort-button" aria-label="下へ" title="下へ" onclick={() => movePrompt(prompt.id, 'down')} disabled={promptsOrdered[promptsOrdered.length - 1]?.id === prompt.id}>↓</button>
            <button class="edit-button" onclick={() => openInSidePanel(prompt.id)} disabled={deletingIds.has(prompt.id)}>編集</button>
            <button class="delete-button" onclick={() => deletePrompt(prompt.id)} disabled={deletingIds.has(prompt.id)}>{deletingIds.has(prompt.id) ? '削除中...' : '削除'}</button>
          </div>
        </div>
        {/each}
      </div>
    </div>
  {:else if view === 'edit'}
    <div in:fade={{ duration: 200 }}>
      <EditPrompt
        promptId={editingPromptId}
        promptSelectionReset={promptSelectionReset}
        backToList={backToList}
      />
    </div>
  {/if}
</div>

<style>
  @reference "tailwindcss";
  .prompts-container {
    @apply flex flex-col p-0 h-full gap-4 min-h-[500px];
  }
  .prompt-info h4 { 
    @apply text-sm text-gray-900 mb-1;
  }
  .prompt-info p { 
    @apply text-xs text-gray-600 m-0;
  }

  .prompt-header {
    @apply mb-3 flex items-center gap-3;
  }
  .diff-actions { @apply inline-flex gap-2; }
  .secondary-button { @apply px-3 py-2 text-sm bg-white text-gray-800 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed; }

  .prompt-list {
    @apply flex flex-col gap-2.5 max-h-[500px] overflow-y-auto;
  }

  .prompt-list.popup-view {
    @apply max-h-[400px];
  }

  .prompt-item {
    @apply flex justify-between items-center p-4 bg-[#f8f9fa] rounded-lg transition-colors;
  }

  .prompt-item:hover {
    @apply bg-[#e9ecef];
  }

  .prompt-actions {
    @apply flex gap-2.5;
  }
  .sort-button {
    @apply px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed;
  }
</style> 
