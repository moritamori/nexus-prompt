/**
 * スナップショット自動保存のためのアクション
 */
export function createSnapshotManager(saveSnapshot: () => Promise<void> | void) {
  let isThrottled = false;
  let hasPendingChanges = false;

  const throttledSave = () => {
    if (isThrottled) {
      hasPendingChanges = true;
      return;
    }

    isThrottled = true;
    void saveSnapshot(); // 先頭保存

    setTimeout(() => {
      isThrottled = false;
      if (hasPendingChanges) {
        void saveSnapshot(); // 末尾保存（取りこぼし防止）
      }
    }, 500);
  };

  // 入力があるたびに呼び出される関数（ローカル状態は bind で更新されるため、保存のみスロットリング）
  const handleInput = () => {
    throttledSave();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      saveSnapshot();
    }
  };

  // クリーンアップ時の保存
  const cleanup = () => {
    if (hasPendingChanges) {
      saveSnapshot();
    }
  };

  return {
    handleInput,
    handleVisibilityChange,
    cleanup,
    get hasPendingChanges() {
      return hasPendingChanges;
    },
    set hasPendingChanges(value: boolean) {
      hasPendingChanges = value;
    }
  };
}
