/**
 * useIsDarkMode — reactively returns true when the document is in dark
 * mode. The app toggles dark mode by adding/removing the `.dark` class on
 * <html> (see Layout.tsx). We listen to that class via MutationObserver
 * so any component using inline styles can re-render when the user flips
 * the theme.
 *
 * Tailwind's `dark:` variant covers most of our UI, but anything that
 * uses inline `style={{ background: '#FFF' }}` (e.g. the Livv editorial
 * Finance components) needs to opt into dark mode manually — that's
 * what this hook is for.
 */
import { useEffect, useState } from 'react';

const readIsDark = (): boolean => {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
};

export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => readIsDark());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const target = document.documentElement;

    // Sync once on mount in case SSR mismatch left us out of sync.
    setIsDark(readIsDark());

    const observer = new MutationObserver(() => {
      setIsDark(readIsDark());
    });
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
