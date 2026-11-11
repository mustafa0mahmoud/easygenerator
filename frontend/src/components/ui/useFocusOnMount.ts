import { useEffect, useRef } from 'react';

/**
 * Moves focus to an element when its page appears. A client-side route
 * change does not reload the document, so without this a screen reader says
 * nothing and keyboard focus stays on a control that no longer exists.
 * Focusing the page heading announces the new page and restarts tabbing
 * from the top.
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return ref;
}
