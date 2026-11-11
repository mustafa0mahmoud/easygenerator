import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown.ts';

const START = new Date('2026-01-01T00:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('counts down to zero and stops', () => {
    const { result } = renderHook(() => useCountdown(START + 3_000));
    expect(result.current).toBe(3);

    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(2);

    act(() => void vi.advanceTimersByTime(2_000));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is zero, with no timer, for a moment already in the past', () => {
    const { result } = renderHook(() => useCountdown(START - 1));

    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('follows the clock, not the number of ticks (a tab that slept)', () => {
    const { result } = renderHook(() => useCountdown(START + 60_000));

    // The clock jumps 50 s but only one tick fires.
    vi.setSystemTime(START + 50_000);
    act(() => void vi.advanceTimersByTime(250));

    expect(result.current).toBe(10);
  });

  it('restarts when the target moves, and stops its timer on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ endsAt }) => useCountdown(endsAt),
      { initialProps: { endsAt: START } },
    );
    expect(result.current).toBe(0);

    rerender({ endsAt: START + 60_000 });
    expect(result.current).toBe(60);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
