import assert from 'node:assert/strict';
import test from 'node:test';
import { clampProgress, storyFrame, storyTime } from '../lib/scroll-story.mjs';

test('scroll chapters move forward and reverse without elapsed-time state', () => {
  const state = top => storyFrame({ top, height: 2600, viewport: 1000, pinned: true });
  assert.deepEqual([state(100).step, state(-800).step, state(-1600).step], [0, 1, 2]);
  assert.equal(state(-400).step, 0);
  assert.equal(state(-1600).reply, 1);
  assert.equal(state(-1600).booking, 1);
  assert.equal(state(100).reply, 0);
  assert.equal(state(-9000).progress, 1);
});

test('ordinary mobile scrolling completes before the visual leaves the viewport', () => {
  const state = top => storyFrame({ top, height: 550, viewport: 800, pinned: false });
  assert.equal(state(800).progress, 0);
  assert.equal(state(100).progress, 1);
  assert.equal(state(-100).step, 2);
});

test('seeking clamps to valid, non-ended media times and handles missing metadata', () => {
  assert.equal(clampProgress(NaN), 0);
  assert.equal(storyTime(NaN, .5), 0);
  assert.equal(storyTime(Infinity, .5), 0);
  assert.equal(storyTime(8, -1), 0);
  assert.equal(storyTime(8, 2), 7.92);
  assert.equal(storyTime(8, .5), 3.96);
  assert.equal(storyTime(-1, .5), 0);
});
