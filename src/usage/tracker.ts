type UsageEvent = {
  name: string;
  at: string;
};

const maxEvents = 100;

export class UsageTracker {
  private events: UsageEvent[] = [];

  record(name: string) {
    this.events.push({ name, at: new Date().toISOString() });
    this.events = this.events.slice(-maxEvents);
  }

  status(limit = 5) {
    return {
      top: this.top(limit),
      latest: this.events.slice(-limit).reverse()
    };
  }

  clear() {
    this.events = [];
  }

  private top(limit: number) {
    const byName = new Map<string, { name: string; count: number; lastUsedAt: string }>();

    for (const event of this.events) {
      const existing = byName.get(event.name);
      if (existing) {
        existing.count += 1;
        existing.lastUsedAt = event.at;
      } else {
        byName.set(event.name, { name: event.name, count: 1, lastUsedAt: event.at });
      }
    }

    return [...byName.values()]
      .sort((left, right) => right.count - left.count || right.lastUsedAt.localeCompare(left.lastUsedAt))
      .slice(0, limit);
  }
}
