/**
 * Test environment: a tiny in-memory localStorage so the save code can run
 * under Node, plus a seeded random so match simulations are repeatable.
 */
import { beforeEach } from 'vitest';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
}

(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();

/** Mulberry32: small, fast and good enough to make a simulated match repeatable. */
export function seedRandom(seed: number): void {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seed once now too: test files build teams when they load, before any beforeEach, and those players'
// skills and builds must be the same on every run, or a match that depends on them is a coin toss.
seedRandom(1234);

beforeEach(() => {
  localStorage.clear();
  seedRandom(1234);
});
