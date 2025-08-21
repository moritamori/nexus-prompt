<script lang="ts">
  import { FileImportExportService } from '../services/file-import-export';
  import { showToast, plan } from '../stores';
  import { useNavHistory } from '../actions/navigation';
  
  let isImportExportLoading = $state(false);

  const fileImportExportService = new FileImportExportService();

  // Event handler
  let { backToSettings } = $props();

  async function exportFile(): Promise<void> {
    try {
      isImportExportLoading = true;
      const zipBytes = await fileImportExportService.export();

      // ZIPダウンロードの実行（ArrayBufferに切り出して型互換にする）
      const arrayBuffer = zipBytes.buffer.slice(
        zipBytes.byteOffset,
        zipBytes.byteOffset + zipBytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus-prompt-export-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('データをZIPとしてエクスポートしました', 'success');
    } catch (error) {
      console.error('エクスポート中にエラーが発生:', error);
      showToast('エクスポートに失敗しました', 'error');
    } finally {
      isImportExportLoading = false;
    }
  }

  async function importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      return;
    }

    if (!window.confirm('既存のデータは上書かれます。本当にインポートしてよろしいですか？')) {
      input.value = '';
      return;
    }

    try {
      isImportExportLoading = true;
      const arrayBuffer = await file.arrayBuffer();
      await fileImportExportService.import(arrayBuffer, $plan);
      
      showToast('フレームワークデータをインポートしました', 'success');
    } catch (error) {
      console.error('インポート中にエラーが発生:', error);
      const rawMessage = error instanceof Error ? error.message : 'インポートに失敗しました';
      const normalizedMessage = /central directory|zip file/i.test(rawMessage)
        ? 'インポートファイルの形式が正しくありません。'
        : rawMessage;
      showToast(normalizedMessage, 'error');
    } finally {
      isImportExportLoading = false;
      input.value = '';
    }
  }

  const { backToListHandler } = useNavHistory(() => backToSettings(), {
    getDetailState: () => ({ view: 'settings', screen: 'data-management' }),
  });

  function openFileDialog(): void {
    const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }
  function backToSettingsButtonHandler(): void {
    backToListHandler();
  }
</script>

<div class="data-management">
  <button type="button" class="link-back" data-testid="back-to-list-button" onclick={backToSettingsButtonHandler}>← 設定へ戻る</button>

  <div class="form-group">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label>データ管理</label>
    <div class="import-export-group">
      <div class="import-export-item">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>フレームワーク・LLMプロンプトデータのエクスポート</label>
        <p class="description">作成したフレームワークとLLMプロンプトをJSONファイルとしてダウンロードします</p>
        <button
          class="secondary-button"
          onclick={exportFile}
          disabled={isImportExportLoading}
          data-testid="export-button">
          {isImportExportLoading ? 'エクスポート中...' : 'エクスポート'}
        </button>
      </div>
      
      <div class="import-export-item">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>フレームワーク・LLMプロンプトデータのインポート</label>
        <p class="description">JSONファイルからフレームワークとLLMプロンプトをインポートします（既存データは上書きされます）</p>
        <button
          class="secondary-button"
          onclick={openFileDialog}
          disabled={isImportExportLoading}
          data-testid="import-button">
          {isImportExportLoading ? 'インポート中...' : 'インポート'}
        </button>
        <input
          id="import-file-input"
          type="file"
          accept=".zip"
          onchange={importFile}
          style="display: none;"
          data-testid="import-file-input" />
      </div>
    </div>
  </div>
</div>

<style>
  @reference "tailwindcss";
  .data-management {
    @apply flex flex-col p-0 h-full gap-4;
  }
  .import-export-group {
    @apply flex flex-col gap-4; 
  }
  .import-export-item { 
    @apply flex flex-col gap-2;
  }
  .import-export-item label {
    @apply font-medium text-sm text-gray-900;
  }
  .import-export-item .description {
    @apply text-xs text-gray-600 m-0; 
  }
</style>