import { describe, it, expect } from 'vitest';
import { calculateKeepSermonSegments } from '../src/lib/ffmpeg.js';

describe('calculateKeepSermonSegments', () => {
  it('returns full sermon segment when no cuts are removed', () => {
    const sermonCuts = [{ start: 15.0, end: 300.0, type: 'sermon', reason: 'Sermon' }];
    const removeCuts = [];
    const kept = calculateKeepSermonSegments(sermonCuts, removeCuts);
    expect(kept).toHaveLength(1);
    expect(kept[0].start).toBe(15.0);
    expect(kept[0].end).toBe(300.0);
  });

  it('removes one cut in the middle of the sermon', () => {
    const sermonCuts = [{ start: 0.0, end: 200.0, type: 'sermon', reason: 'Sermon' }];
    const removeCuts = [{ start: 60.0, end: 80.0, type: 'cut', reason: 'Joke' }];
    const kept = calculateKeepSermonSegments(sermonCuts, removeCuts);
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ start: 0.0, end: 60.0 });
    expect(kept[1]).toMatchObject({ start: 80.0, end: 200.0 });
  });

  it('removes cut at the start of the sermon', () => {
    const sermonCuts = [{ start: 15.0, end: 200.0, type: 'sermon', reason: 'Sermon' }];
    const removeCuts = [{ start: 15.0, end: 30.0, type: 'cut', reason: 'Intro tangent' }];
    const kept = calculateKeepSermonSegments(sermonCuts, removeCuts);
    expect(kept).toHaveLength(1);
    expect(kept[0].start).toBe(30.0);
  });

  it('removes cut at the end of the sermon', () => {
    const sermonCuts = [{ start: 0.0, end: 200.0, type: 'sermon', reason: 'Sermon' }];
    const removeCuts = [{ start: 185.0, end: 200.0, type: 'cut', reason: 'Outro joke' }];
    const kept = calculateKeepSermonSegments(sermonCuts, removeCuts);
    expect(kept).toHaveLength(1);
    expect(kept[0].end).toBe(185.0);
  });

  it('handles multiple cuts in the same sermon segment', () => {
    const sermonCuts = [{ start: 0.0, end: 300.0, type: 'sermon', reason: 'Sermon' }];
    const removeCuts = [
      { start: 60.0, end: 70.0, type: 'cut', reason: 'First joke' },
      { start: 150.0, end: 165.0, type: 'cut', reason: 'Second joke' },
    ];
    const kept = calculateKeepSermonSegments(sermonCuts, removeCuts);
    expect(kept).toHaveLength(3);
    expect(kept[0]).toMatchObject({ start: 0, end: 60 });
    expect(kept[1]).toMatchObject({ start: 70, end: 150 });
    expect(kept[2]).toMatchObject({ start: 165, end: 300 });
  });

  it('ignores cuts that do not overlap with sermon segments', () => {
    const sermonCuts = [{ start: 50.0, end: 200.0, type: 'sermon', reason: 'Sermon' }];
    const removeCuts = [
      { start: 10.0, end: 20.0, type: 'cut', reason: 'Cut before sermon' },
      { start: 250.0, end: 300.0, type: 'cut', reason: 'Cut after sermon' },
    ];
    const kept = calculateKeepSermonSegments(sermonCuts, removeCuts);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ start: 50.0, end: 200.0 });
  });

  it('returns empty when no sermon segments provided', () => {
    const kept = calculateKeepSermonSegments([], [{ start: 0, end: 10, type: 'cut', reason: 'x' }]);
    expect(kept).toHaveLength(0);
  });
});
