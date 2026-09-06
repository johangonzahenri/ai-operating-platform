export interface MemoryRecord { readonly id: string; readonly namespace: string; readonly content: Readonly<Record<string, unknown>>; }
export interface MemoryStore { remember(record: MemoryRecord): Promise<void>; recall(namespace: string): Promise<readonly MemoryRecord[]>; }
