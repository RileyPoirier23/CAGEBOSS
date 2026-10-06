/** Tiny typed event bus used by UI and audio. */
type Handler = (payload?: any) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(evt: string, h: Handler): () => void {
    let set = this.handlers.get(evt);
    if (!set) this.handlers.set(evt, (set = new Set()));
    set.add(h);
    return () => set!.delete(h);
  }

  emit(evt: string, payload?: any): void {
    this.handlers.get(evt)?.forEach((h) => h(payload));
    this.handlers.get('*')?.forEach((h) => h({ evt, payload }));
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
