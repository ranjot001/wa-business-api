import { describe, expect, it } from 'vitest';
import { statusOutranks } from '@crm/shared';

/**
 * Meta does not promise ordered webhook delivery, so these are the rules that
 * stop a late callback from undoing a later truth.
 */
describe('statusOutranks', () => {
  it('allows the normal forward path', () => {
    expect(statusOutranks('sent', 'queued')).toBe(true);
    expect(statusOutranks('delivered', 'sent')).toBe(true);
    expect(statusOutranks('read', 'delivered')).toBe(true);
  });

  it('refuses to downgrade read to delivered', () => {
    expect(statusOutranks('delivered', 'read')).toBe(false);
  });

  it('refuses to reapply the same status', () => {
    expect(statusOutranks('read', 'read')).toBe(false);
  });

  it('lets a failure overwrite any success', () => {
    expect(statusOutranks('failed', 'read')).toBe(true);
  });

  it('never overwrites a failure with a late success', () => {
    expect(statusOutranks('read', 'failed')).toBe(false);
    expect(statusOutranks('delivered', 'failed')).toBe(false);
  });

  it('ignores a status it does not recognise', () => {
    expect(statusOutranks('teleported', 'sent')).toBe(false);
    expect(statusOutranks('read', 'teleported')).toBe(false);
  });
});
