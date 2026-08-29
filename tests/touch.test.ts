import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimMenu } from '../src/ui/touch';

// `claimMenu` is the only part of the gesture code that is pure enough to test
// without a DOM: the rest is listener plumbing, exercised in the app.
describe('claimMenu', () => {
  // `claimMenu` keeps its last time in module state, so each test has to start
  // well after the one before it rather than at the same instant.
  let clock = Date.parse('2026-08-30T00:00:00Z');
  beforeEach(() => {
    clock += 60_000;
    vi.useFakeTimers();
    vi.setSystemTime(clock);
  });
  afterEach(() => { vi.useRealTimers(); });

  // A long press and a right-click are the same request, and some platforms
  // send both — which stacked two identical menus on top of each other.
  it('lets the first gesture through and refuses the second', () => {
    expect(claimMenu()).toBe(true);
    expect(claimMenu()).toBe(false);
  });

  it('lets a later, separate gesture through', () => {
    expect(claimMenu()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(claimMenu()).toBe(true);
  });

  it('still refuses one that arrives just inside the window', () => {
    expect(claimMenu()).toBe(true);
    vi.advanceTimersByTime(700);
    expect(claimMenu()).toBe(false);
  });
})
