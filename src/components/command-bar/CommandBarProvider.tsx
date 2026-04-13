import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

interface CommandBarContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandBarContext = createContext<CommandBarContextValue | null>(null);

export function useCommandBar(): CommandBarContextValue {
  const ctx = useContext(CommandBarContext);
  if (!ctx) throw new Error('useCommandBar must be used within CommandBarProvider');
  return ctx;
}

interface CommandBarProviderProps {
  children: ReactNode;
}

export function CommandBarProvider({ children }: CommandBarProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
        return;
      }

      // '/' when not focused on an input/textarea/select/contenteditable
      if (e.key === '/') {
        const target = e.target as HTMLElement;
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        open();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, toggle]);

  return (
    <CommandBarContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandBarContext.Provider>
  );
}
