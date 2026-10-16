import { ORPHANED_ROUND_TAKEOVER_MS, pickRoundForSpin, pickRoundToResume } from './slot-round-ownership';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const round = (id: string, ownerToken: string | null, secondsSinceLastSpin: number) => ({
  id,
  ownerToken,
  lastSpinAt: new Date(NOW - secondsSinceLastSpin * 1000),
});

describe('pickRoundForSpin', () => {
  it('continues only the bonus of the window that spins', () => {
    const rounds = [round('editor', 'tab-editor', 2)];
    expect(pickRoundForSpin(rounds, 'tab-editor')?.id).toBe('editor');
    expect(pickRoundForSpin(rounds, 'tab-browser')).toBeUndefined();
  });

  it('never hands an abandoned bonus to a window that is just spinning', () => {
    const rounds = [round('old', 'tab-closed', 3600)];
    expect(pickRoundForSpin(rounds, 'tab-browser')).toBeUndefined();
  });

  it('keeps legacy clients (no token) on legacy rounds only', () => {
    const rounds = [round('new', 'tab-a', 2), round('legacy', null, 2)];
    expect(pickRoundForSpin(rounds, undefined)?.id).toBe('legacy');
    expect(pickRoundForSpin([round('new', 'tab-a', 2)], undefined)).toBeUndefined();
  });

  it('gives each window its own bonus when both have one', () => {
    const rounds = [round('a', 'tab-a', 2), round('b', 'tab-b', 2)];
    expect(pickRoundForSpin(rounds, 'tab-a')?.id).toBe('a');
    expect(pickRoundForSpin(rounds, 'tab-b')?.id).toBe('b');
  });
});

describe('pickRoundToResume', () => {
  it('resumes the same tab after a reload', () => {
    expect(pickRoundToResume([round('mine', 'tab-a', 1)], 'tab-a', NOW)?.id).toBe('mine');
  });

  it('does not take a bonus another window is playing', () => {
    expect(pickRoundToResume([round('busy', 'tab-b', 5)], 'tab-a', NOW)).toBeUndefined();
  });

  it('takes over a bonus abandoned past the takeover window', () => {
    const justUnder = ORPHANED_ROUND_TAKEOVER_MS / 1000 - 1;
    const justOver = ORPHANED_ROUND_TAKEOVER_MS / 1000;
    expect(pickRoundToResume([round('x', 'tab-b', justUnder)], 'tab-a', NOW)).toBeUndefined();
    expect(pickRoundToResume([round('x', 'tab-b', justOver)], 'tab-a', NOW)?.id).toBe('x');
  });

  it('prefers its own bonus over an abandoned one', () => {
    const rounds = [round('abandoned', 'tab-b', 3600), round('mine', 'tab-a', 1)];
    expect(pickRoundToResume(rounds, 'tab-a', NOW)?.id).toBe('mine');
  });
});
