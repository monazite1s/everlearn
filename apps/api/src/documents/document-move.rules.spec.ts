/** @fileoverview 验证文档树移动的环检测与相邻落位计算规则。 */
import { describe, expect, test } from 'vitest';

import { computePlacement, isSelfOrDescendantTarget } from './document-move.rules';

const movedId = 'd0000000-0000-4000-8000-000000000000';
const firstId = 'd0000000-0000-4000-8000-000000000001';
const secondId = 'd0000000-0000-4000-8000-000000000002';
const thirdId = 'd0000000-0000-4000-8000-000000000003';

describe('isSelfOrDescendantTarget', () => {
  test('accepts self and descendant paths only with segment boundary', () => {
    const movedPath = `/${movedId}`;
    expect(isSelfOrDescendantTarget(movedId, movedPath, movedId, movedPath)).toBe(true);
    expect(isSelfOrDescendantTarget(movedId, movedPath, firstId, `${movedPath}/${firstId}`)).toBe(
      true,
    );
    expect(
      isSelfOrDescendantTarget(movedId, movedPath, secondId, `${movedPath}/${firstId}/${secondId}`),
    ).toBe(true);
    expect(isSelfOrDescendantTarget(movedId, movedPath, firstId, `/${firstId}`)).toBe(false);
    expect(isSelfOrDescendantTarget(movedId, movedPath, firstId, `/${movedId}f`)).toBe(false);
  });
});

describe('computePlacement with available gaps', () => {
  test('appends after the highest position including soft-deleted siblings', () => {
    const siblings = [
      { id: firstId, position: 0n },
      { id: secondId, position: 1024n },
    ];
    const placement = computePlacement(siblings, { kind: 'end' }, movedId, 5000n);
    expect(placement).toEqual({ kind: 'position', position: 6024n });
  });

  test('restarts at zero when the target parent has no sibling rows', () => {
    const placement = computePlacement([], { kind: 'end' }, movedId, -1024n);
    expect(placement).toEqual({ kind: 'position', position: 0n });
  });

  test('floors the midpoint for odd gaps', () => {
    const siblings = [
      { id: firstId, position: 0n },
      { id: secondId, position: 1025n },
    ];
    const placement = computePlacement(siblings, { kind: 'before', id: secondId }, movedId, 1025n);
    expect(placement).toEqual({ kind: 'position', position: 512n });
  });

  test('treats an anchor on the last sibling as an end append', () => {
    const siblings = [
      { id: firstId, position: 0n },
      { id: secondId, position: 1024n },
    ];
    const placement = computePlacement(siblings, { kind: 'after', id: secondId }, movedId, 3000n);
    expect(placement).toEqual({ kind: 'position', position: 4024n });
  });
});

describe('computePlacement with anchored midpoints', () => {
  test('uses the midpoint when the adjacent gap has room', () => {
    const siblings = [
      { id: firstId, position: 0n },
      { id: secondId, position: 2048n },
      { id: thirdId, position: 4096n },
    ];
    const beforeSecond = computePlacement(
      siblings,
      { kind: 'before', id: secondId },
      movedId,
      4096n,
    );
    expect(beforeSecond).toEqual({ kind: 'position', position: 1024n });
    const afterFirst = computePlacement(siblings, { kind: 'after', id: firstId }, movedId, 4096n);
    expect(afterFirst).toEqual({ kind: 'position', position: 1024n });
  });
});

describe('computePlacement with exhausted gaps', () => {
  test('rebalances the parent when adjacent positions have no free integer', () => {
    const siblings = [
      { id: firstId, position: 0n },
      { id: secondId, position: 1n },
      { id: thirdId, position: 2n },
    ];
    const beforeSecond = computePlacement(siblings, { kind: 'before', id: secondId }, movedId, 2n);
    expect(beforeSecond).toEqual({
      kind: 'rebalance',
      movedPosition: 1024n,
      order: [firstId, movedId, secondId, thirdId],
    });
    const afterFirst = computePlacement(siblings, { kind: 'after', id: firstId }, movedId, 2n);
    expect(afterFirst).toEqual({
      kind: 'rebalance',
      movedPosition: 1024n,
      order: [firstId, movedId, secondId, thirdId],
    });
  });

  test('rebalances when inserting before a sibling positioned at zero', () => {
    const siblings = [{ id: firstId, position: 0n }];
    const placement = computePlacement(siblings, { kind: 'before', id: firstId }, movedId, 0n);
    expect(placement).toEqual({
      kind: 'rebalance',
      movedPosition: 0n,
      order: [movedId, firstId],
    });
  });

  test('rejects a missing anchor sibling instead of guessing a slot', () => {
    const siblings = [{ id: firstId, position: 0n }];
    expect(() =>
      computePlacement(siblings, { kind: 'before', id: thirdId }, movedId, 0n),
    ).toThrowError('Move anchor sibling is missing');
  });
});
