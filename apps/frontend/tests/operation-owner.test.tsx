import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useOperationOwner } from '@/hooks/use-operation-owner';

it('invalidates the old context before consumers run their commit effects', () => {
  let previous: (() => boolean) | undefined;
  const observed: boolean[] = [];
  const { result, rerender } = renderHook(
    ({ id }) => {
      const owner = useOperationOwner(id);
      useLayoutEffect(() => {
        if (previous) observed.push(previous());
      }, [id]);
      return owner;
    },
    { initialProps: { id: 'a' } }
  );
  act(() => {
    const token = result.current.begin();
    if (token === null) throw new Error('Owner not mounted');
    const check = result.current.isCurrent;
    previous = () => check(token);
  });
  rerender({ id: 'b' });
  expect(observed).toEqual([false]);
});
