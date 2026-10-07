import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WINDOW_MS, isWindowOpen, windowExpiresAt } from '../src/conversations/window';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function contactWhoWroteAt(at: Date | null) {
  return { lastInboundAt: at };
}

describe('24 hour window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is closed for a contact who has never written in', () => {
    expect(isWindowOpen(contactWhoWroteAt(null))).toBe(false);
    expect(windowExpiresAt(contactWhoWroteAt(null))).toBeNull();
  });

  it('is open right after an inbound message', () => {
    expect(isWindowOpen(contactWhoWroteAt(new Date(NOW.getTime() - 1_000)))).toBe(true);
  });

  it('is still open one millisecond before 24 hours', () => {
    const contact = contactWhoWroteAt(new Date(NOW.getTime() - WINDOW_MS + 1));
    expect(isWindowOpen(contact)).toBe(true);
  });

  it('is closed at exactly 24 hours, since the rule is strictly less than', () => {
    const contact = contactWhoWroteAt(new Date(NOW.getTime() - WINDOW_MS));
    expect(isWindowOpen(contact)).toBe(false);
  });

  it('closes as the clock moves past the expiry', () => {
    const contact = contactWhoWroteAt(new Date(NOW.getTime() - 23 * HOUR));
    expect(isWindowOpen(contact)).toBe(true);

    vi.advanceTimersByTime(HOUR - 1);
    expect(isWindowOpen(contact)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isWindowOpen(contact)).toBe(false);
  });

  it('reopens when a new inbound message moves last_inbound_at', () => {
    const contact = contactWhoWroteAt(new Date(NOW.getTime() - 30 * HOUR));
    expect(isWindowOpen(contact)).toBe(false);

    contact.lastInboundAt = new Date(NOW.getTime());
    expect(isWindowOpen(contact)).toBe(true);
  });

  it('expires exactly 24 hours after the last inbound message', () => {
    const lastInboundAt = new Date('2026-10-07T09:30:00.000Z');
    expect(windowExpiresAt(contactWhoWroteAt(lastInboundAt))?.toISOString()).toBe(
      '2026-10-08T09:30:00.000Z',
    );
  });
});
