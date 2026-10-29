import { describe, expect, it } from 'vitest';
import { applyUpdateEvent, createUpdateStatus } from './updateState';

describe('createUpdateStatus', () => {
  it('starts idle in a supported build and unsupported elsewhere', () => {
    expect(createUpdateStatus('1.0.0', true)).toEqual({
      phase: 'idle',
      currentVersion: '1.0.0',
      supported: true,
    });

    const unsupported = createUpdateStatus('1.0.0', false);
    expect(unsupported.phase).toBe('unsupported');
    expect(unsupported.supported).toBe(false);
  });
});

describe('applyUpdateEvent', () => {
  it('moves through checking → available → progress → downloaded', () => {
    let status = createUpdateStatus('1.0.0', true);

    status = applyUpdateEvent(status, { type: 'checking' });
    expect(status.phase).toBe('checking');

    status = applyUpdateEvent(status, { type: 'available', version: '1.1.0' });
    expect(status.phase).toBe('available');
    expect(status.availableVersion).toBe('1.1.0');

    status = applyUpdateEvent(status, {
      type: 'progress',
      percent: 42.5,
      transferred: 100,
      total: 200,
      bytesPerSecond: 50,
    });
    expect(status.phase).toBe('downloading');
    expect(status.progress).toEqual({
      percent: 42.5,
      transferred: 100,
      total: 200,
      bytesPerSecond: 50,
    });

    status = applyUpdateEvent(status, { type: 'downloaded', version: '1.1.0' });
    expect(status.phase).toBe('downloaded');
    expect(status.availableVersion).toBe('1.1.0');
    expect(status.progress?.percent).toBe(100);
  });

  it('reports up to date when a check finds no newer version', () => {
    let status = createUpdateStatus('1.0.0', true);
    status = applyUpdateEvent(status, { type: 'checking' });
    status = applyUpdateEvent(status, { type: 'not-available' });

    expect(status.phase).toBe('up-to-date');
    expect(status.availableVersion).toBeUndefined();
  });

  it('treats the installed version reported as available as up to date', () => {
    const status = applyUpdateEvent(createUpdateStatus('1.0.0', true), {
      type: 'available',
      version: '1.0.0',
    });
    expect(status.phase).toBe('up-to-date');
  });

  it('never moves a downloaded update backwards on a later check', () => {
    let status = createUpdateStatus('1.0.0', true);
    status = applyUpdateEvent(status, { type: 'available', version: '1.1.0' });
    status = applyUpdateEvent(status, { type: 'downloaded', version: '1.1.0' });

    expect(applyUpdateEvent(status, { type: 'checking' }).phase).toBe('downloaded');
    expect(applyUpdateEvent(status, { type: 'not-available' }).phase).toBe('downloaded');
    expect(applyUpdateEvent(status, { type: 'available', version: '1.0.5' }).phase).toBe('downloaded');
  });

  it('clamps progress values into a safe range', () => {
    const status = applyUpdateEvent(createUpdateStatus('1.0.0', true), {
      type: 'progress',
      percent: 150,
      transferred: -5,
      total: Number.NaN,
      bytesPerSecond: -1,
    });

    expect(status.progress).toEqual({
      percent: 100,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    });
  });

  it('records an error without losing the installed version', () => {
    const status = applyUpdateEvent(createUpdateStatus('1.0.0', true), {
      type: 'error',
      message: 'Could not reach the update server.',
    });

    expect(status.phase).toBe('error');
    expect(status.message).toBe('Could not reach the update server.');
    expect(status.currentVersion).toBe('1.0.0');
  });

  it('ignores every event in a build where updates are unsupported', () => {
    const initial = createUpdateStatus('1.0.0', false);
    expect(applyUpdateEvent(initial, { type: 'checking' })).toBe(initial);
    expect(applyUpdateEvent(initial, { type: 'available', version: '2.0.0' })).toBe(initial);
    expect(applyUpdateEvent(initial, { type: 'error', message: 'x' })).toBe(initial);
  });
});
