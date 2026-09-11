import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface UiState {
  theme: Theme;
  furigana: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setFurigana: (v: boolean) => void;
  hydrate: () => void;
}

const KEY = 'n1-ui';

function persist(state: { theme: Theme; furigana: boolean }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* trình duyệt chặn storage — không phải lỗi nghiêm trọng */
  }
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'light',
  furigana: false,
  setTheme: (theme) => {
    applyTheme(theme);
    persist({ theme, furigana: get().furigana });
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setFurigana: (furigana) => {
    persist({ theme: get().theme, furigana });
    set({ furigana });
  },
  hydrate: () => {
    let theme: Theme = 'light';
    let furigana = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { theme?: Theme; furigana?: boolean };
        theme = parsed.theme === 'dark' ? 'dark' : 'light';
        furigana = Boolean(parsed.furigana);
      } else if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
      }
    } catch {
      /* bỏ qua */
    }
    applyTheme(theme);
    set({ theme, furigana });
  },
}));
