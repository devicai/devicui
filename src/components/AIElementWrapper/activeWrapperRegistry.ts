/**
 * Module-level singleton that coordinates which AIElementWrapper instance
 * currently owns the floating trigger. Ensures only one wrapper shows its
 * trigger at any given time across the page.
 */

type Listener = (activeId: string | null) => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

export function getActiveWrapper(): string | null {
  return activeId;
}

export function setActiveWrapper(id: string | null): void {
  if (activeId === id) return;
  activeId = id;
  for (const l of listeners) l(activeId);
}

export function subscribeActiveWrapper(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
