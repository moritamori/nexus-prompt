import { writable, derived, type Writable } from 'svelte/store';
import type { AppData, SnapshotData, MessageType } from './types';
import { storageService } from './services/storage';
import { loadTranslations } from './lib/translations/translations';

/**
 * ストレージと同期するカスタムストアのインターフェース。
 * Writable に加え、ストレージへの再書き込みをバイパスするメソッドを持ちます。
 */
export interface SyncedStore<T> extends Writable<T> {
  setFromStorage: (value: T) => void;
}

/**
 * chrome.storage.local と自動的に同期するカスタムストアを作成します。
 * @param initialValue 初期値
 * @param storageSaver ストレージに保存するための関数
 */
function createSyncedStore<T>(initialValue: T, storageSaver: (data: T) => Promise<void>): SyncedStore<T> {
  const { subscribe, set: baseSet } = writable<T>(initialValue);

  let currentValue: T = initialValue;
  subscribe((v) => { currentValue = v; });

  let isApplyingFromStorage = false;

  const set = (value: T) => {
    baseSet(value);
    if (!isApplyingFromStorage) {
      void storageSaver(value);
    }
  };

  const update = (updater: (value: T) => T) => {
    const next = updater(currentValue);
    set(next);
  };

  const setFromStorage = (value: T) => {
    isApplyingFromStorage = true;
    baseSet(value);
    isApplyingFromStorage = false;
  };

  return { subscribe, set, update, setFromStorage };
}

// 変更があると自動で chrome.storage.local に保存される
export const appData = createSyncedStore<AppData | null>( 
  null,
  async (data) => { if (data) await storageService.saveAppData(data); }
);

export const snapshotData = createSyncedStore<SnapshotData | null>( 
  null,
  async (data) => { if (data) await storageService.saveSnapshot(data); }
);

export const viewContext = writable<'popup' | 'sidepanel' | 'unknown'>('unknown');

// アプリ初期化完了フラグ
export const isInitialized = writable<boolean>(false);

// グローバルメッセージ（トースト）
export type ToastMessage = { text: string; type: MessageType; visible: boolean } | null;
export const toast = writable<ToastMessage>(null);

let toastTimeoutId: number | null = null;
export function showToast(text: string, type: MessageType = 'info', durationMs = 3000): void {
  // 表示
  toast.set({ text, type, visible: true });
  // 既存タイマーをクリア
  if (toastTimeoutId !== null) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  // 自動クローズ
  toastTimeoutId = window.setTimeout(() => {
    toast.update((prev: ToastMessage) => (prev ? { ...prev, visible: false } : prev));
    toastTimeoutId = null;
  }, durationMs);
}

// 環境フラグ（機能検出）
export interface CapabilitiesState {
  isHeadless: boolean;
  canUseSidePanel: boolean;
}

function detectCapabilities(): CapabilitiesState {
  const isHeadless = typeof navigator !== 'undefined' && /Headless/i.test(navigator.userAgent || '');
  const canUseSidePanel = Boolean((globalThis as any)?.chrome?.sidePanel?.open) && Boolean((globalThis as any)?.chrome?.windows?.getCurrent) && !isHeadless;
  return { isHeadless, canUseSidePanel };
}

export const capabilities = writable<CapabilitiesState>(detectCapabilities());

export function refreshCapabilities(): void {
  capabilities.set(detectCapabilities());
}

export async function initializeStores(): Promise<void> {
  // 初期化開始
  isInitialized.set(false);
  let data: AppData | null = null;
  try {
    data = await storageService.getAppData();
    appData.setFromStorage(data);
  } catch (e) {
    console.warn('AppDataが未初期化のため初期化します:', e);
    await storageService.initializeAppData();
    data = await storageService.getAppData();
    appData.setFromStorage(data);
  }

  snapshotData.setFromStorage(await storageService.getSnapshot());

  await loadTranslations((data as unknown as AppData).settings.language ?? "ja", "/"); 
  // 初期化完了
  isInitialized.set(true);
}

// 課金プラン（独立ストア）
export type Plan = 'free' | 'pro' | 'team' | 'enterprise';
export const plan = writable<Plan>('free');

export const entitlements = derived(plan, ($plan) => {
  const current = $plan ?? 'free';
  const isFree = current === 'free';
  const isProOrAbove = current !== 'free';
  const isTeamOrAbove = current === 'team' || current === 'enterprise';
  const isEnterprise = current === 'enterprise';
  return { plan: current, isFree,isProOrAbove, isTeamOrAbove, isEnterprise };
});
