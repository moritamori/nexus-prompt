import { onMount, onDestroy } from 'svelte';

// 画面遷移用の汎用履歴state
export type HistoryState = { view: string; id?: string | null; screen?: string };

export type UseNavHistoryOptions = {
  getDetailState?: () => HistoryState;
};

export function useNavHistory(
  backToList: () => void,
  options?: UseNavHistoryOptions
): { backToListHandler: () => void } {
  let addedHistoryEntry = false;
  let popstateHandler: ((e: PopStateEvent) => void) | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  onMount(() => {
    try {
      const detailState: HistoryState = options?.getDetailState?.() ?? ({ view: '' } as HistoryState);
      const currentState = (window.history.state ?? {}) as Partial<HistoryState>;
      const isSameState =
        currentState?.view === detailState.view &&
        (currentState as any)?.id === (detailState as any)?.id &&
        (currentState as any)?.screen === (detailState as any)?.screen;
      if (!isSameState) {
        window.history.pushState(detailState, '');
      }
      addedHistoryEntry = true;
    } catch {
      // noop
    }

    popstateHandler = () => {
      if (addedHistoryEntry) {
        addedHistoryEntry = false;
        backToList();
      }
    };
    window.addEventListener('popstate', popstateHandler);

    keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e as any).keyCode === 27) {
        e.preventDefault();
        backToListHandler();
      }
    };
    window.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    if (popstateHandler) {
      window.removeEventListener('popstate', popstateHandler);
      popstateHandler = null;
    }
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  });

  function backToListHandler(): void {
    if (addedHistoryEntry) {
      try {
        window.history.back();
      } catch {
        backToList();
      }
    } else {
      backToList();
    }
  }

  return { backToListHandler };
}

// prompts: 詳細（id）への前進復帰
export function useForwardToDetail(openDetail: (id: string | null) => void): void {
  let popstateHandler: ((e: PopStateEvent) => void) | null = null;

  onMount(() => {
    popstateHandler = (e: PopStateEvent) => {
      const state = (e.state ?? {}) as Partial<HistoryState>;
      if (state && state.view === 'detail') {
        openDetail((state as HistoryState).id ?? null);
      }
    };
    window.addEventListener('popstate', popstateHandler);
  });

  onDestroy(() => {
    if (popstateHandler) {
      window.removeEventListener('popstate', popstateHandler);
      popstateHandler = null;
    }
  });
}

// settings配下のサブ画面（screen）への前進復帰
export function useForwardToScreen(openScreen: (screen: string) => void, expectedView: string = 'settings'): void {
  let popstateHandler: ((e: PopStateEvent) => void) | null = null;

  onMount(() => {
    popstateHandler = (e: PopStateEvent) => {
      const state = (e.state ?? {}) as Partial<HistoryState>;
      if (state && state.view === expectedView && typeof state.screen === 'string') {
        openScreen(state.screen);
      }
    };
    window.addEventListener('popstate', popstateHandler);
  });

  onDestroy(() => {
    if (popstateHandler) {
      window.removeEventListener('popstate', popstateHandler);
      popstateHandler = null;
    }
  });
}
