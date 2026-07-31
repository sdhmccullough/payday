// Theme is a device preference (localStorage), not household data.

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'payday:theme';

export function getTheme(): ThemeChoice {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  if (choice === 'system') {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(KEY);
  } else {
    document.documentElement.dataset.theme = choice;
    localStorage.setItem(KEY, choice);
  }
}

export function initTheme(): void {
  applyTheme(getTheme());
}
