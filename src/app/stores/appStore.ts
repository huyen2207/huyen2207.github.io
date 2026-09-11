import { create } from 'zustand';
import type { DailySession } from '@/domain/session';
import type { EngineContext } from '@/app/services/context';
import { loadContext } from '@/app/services/context';
import { getOrCreateTodaySession } from '@/app/services/sessionService';
import { loadContentOverrides } from '@/app/services/settingsService';
import { profileRepo } from '@/storage/repositories';

export type AppStatus = 'IDLE' | 'LOADING' | 'NEEDS_ONBOARDING' | 'READY' | 'ERROR';

interface AppState {
  status: AppStatus;
  ctx: EngineContext | null;
  session: DailySession | null;
  errorMessage: string | null;
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  setSession: (s: DailySession) => void;
  regenerateSession: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'IDLE',
  ctx: null,
  session: null,
  errorMessage: null,

  bootstrap: async () => {
    set({ status: 'LOADING', errorMessage: null });
    try {
      await loadContentOverrides();
      const profile = await profileRepo.get();
      if (!profile) {
        set({ status: 'NEEDS_ONBOARDING', ctx: null, session: null });
        return;
      }
      const ctx = await loadContext(new Date());
      if (!ctx) {
        set({ status: 'NEEDS_ONBOARDING' });
        return;
      }
      const session = await getOrCreateTodaySession(ctx);
      set({ status: 'READY', ctx, session });
    } catch (err) {
      set({ status: 'ERROR', errorMessage: err instanceof Error ? err.message : String(err) });
    }
  },

  refresh: async () => {
    const ctx = await loadContext(new Date());
    if (!ctx) {
      set({ status: 'NEEDS_ONBOARDING' });
      return;
    }
    const session = await getOrCreateTodaySession(ctx);
    set({ ctx, session, status: 'READY' });
  },

  setSession: (session) => set({ session }),

  regenerateSession: async () => {
    const ctx = get().ctx;
    if (!ctx) return;
    const session = await getOrCreateTodaySession(ctx, true);
    set({ session });
  },
}));
