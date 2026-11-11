import { useCallback, useRef } from 'react';
import { owlReact } from '../../../components/ui/owl/owlReactions.ts';

const SHAKE_CLASS = 'animate-shake';

/**
 * Replays a short shake on an element, used when a submission is rejected.
 * The owl shakes its head along with it.
 */
export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const shake = useCallback(() => {
    owlReact('no');
    const element = ref.current;
    if (!element) return;
    element.classList.remove('animate-rise', SHAKE_CLASS);
    // Reading layout makes the browser restart the animation when it is re-added.
    void element.offsetWidth;
    element.classList.add(SHAKE_CLASS);
  }, []);

  return [ref, shake] as const;
}
