export interface HelloItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
}

export class HelloApplicationEngine {
  private readonly items: Map<string, HelloItem> = new Map([
    ["item-1", { id: "item-1", name: "Sample Item A", category: "General", description: "Standard demonstration item" }],
    ["item-2", { id: "item-2", name: "Sample Item B", category: "General", description: "Advanced demonstration item" }],
  ]);

  listItems(): readonly HelloItem[] {
    return Array.from(this.items.values());
  }

  getItem(id: string): HelloItem | undefined {
    return this.items.get(id);
  }
}
