import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { SYSTEM_JOBS, type PingJobData } from '@crm/shared';
import { createSystemProcessor } from '../src/queues/system.processor';

const logger = pino({ level: 'silent' });

function job(name: string): Job<PingJobData> {
  return { id: '1', name, data: { at: 'now', source: 'test' } } as Job<PingJobData>;
}

describe('system processor', () => {
  it('handles the ping job', async () => {
    const result = await createSystemProcessor(logger)(job(SYSTEM_JOBS.PING));
    expect(result.pong).toBe(true);
  });

  it('rejects an unknown job name', async () => {
    await expect(createSystemProcessor(logger)(job('nope'))).rejects.toThrow(/Unknown system job/);
  });
});
