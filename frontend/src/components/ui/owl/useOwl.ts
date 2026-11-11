import { useEffect, useRef } from 'react';

export type OwlReaction = 'yes' | 'no';

const REACTION_EVENT = 'owl:react';
/** A reaction fired just before a page change is replayed by the next owl. */
const REACTION_CARRY_MS = 1_500;
const REACTION_MS = 650;
const FLAP_MS = 620;
const BLINK_MS = 140;
const BLINK_MIN_GAP_MS = 2_400;
const BLINK_GAP_SPREAD_MS = 3_600;

/** How far a pupil travels, in the drawing's own units. */
const MAX_LOOK = 6;
/** Pointer distance (px) at which the pupils reach their full travel. */
const FULL_LOOK_DISTANCE = 140;
/** Rough width of a typed character, to aim at the end of the text. */
const TYPED_CHAR_PX = 8.4;
const FIELD_PADDING_PX = 14;

/** Marks an input whose content the owl must not watch. */
export const PASSWORD_FIELD_ATTRIBUTE = 'data-password-field';

let lastReaction: { kind: OwlReaction; at: number } | null = null;

/**
 * Makes the owl nod (`yes`) or shake its head (`no`). Callable from anywhere:
 * forms report an outcome without knowing where, or whether, an owl exists.
 */
export function owlReact(kind: OwlReaction): void {
  lastReaction = { kind, at: Date.now() };
  window.dispatchEvent(
    new CustomEvent<OwlReaction>(REACTION_EVENT, { detail: kind }),
  );
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The owl's behaviour. Its eyes follow the pointer, or the end of the text
 * while a field is being typed in; it covers its eyes over a hidden password
 * and peeks when the password is revealed; it blinks now and then, reacts to
 * outcomes, and flaps when clicked.
 *
 * Everything is done on the DOM directly (classes and one transform per
 * pupil), never through React state: a pointer move must not re-render the
 * page. It only ever reads a field's length and position, never its value.
 */
export function useOwl<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const owl = ref.current;
    if (!owl) return;

    const pupils = [...owl.querySelectorAll<SVGGElement>('[data-owl-pupil]')];
    const discs = [
      ...owl.querySelectorAll<SVGCircleElement>('[data-owl-disc]'),
    ];
    const still = prefersReducedMotion();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let focused: HTMLInputElement | null = null;
    let frame = 0;

    const later = (run: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);
      timers.add(timer);
    };

    const lookAt = (x: number, y: number) => {
      discs.forEach((disc, index) => {
        const box = disc.getBoundingClientRect();
        const dx = x - (box.left + box.width / 2);
        const dy = y - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / FULL_LOOK_DISTANCE) * MAX_LOOK;
        pupils[index].style.transform =
          `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
      });
    };

    const update = () => {
      const isPassword =
        focused?.hasAttribute(PASSWORD_FIELD_ATTRIBUTE) ?? false;
      const hidden = isPassword && focused?.type === 'password';
      owl.classList.toggle('owl-shy', hidden);
      owl.classList.toggle('owl-peek', isPassword && !hidden);
      if (focused && !isPassword) {
        const box = focused.getBoundingClientRect();
        const typed = Math.min(
          box.width - FIELD_PADDING_PX,
          FIELD_PADDING_PX + focused.value.length * TYPED_CHAR_PX,
        );
        lookAt(box.left + typed, box.top + box.height / 2);
      }
    };

    const play = (className: string, ms: number) => {
      if (still) return;
      owl.classList.remove(className);
      // Reading layout lets the same animation start again.
      void owl.offsetWidth;
      owl.classList.add(className);
      later(() => owl.classList.remove(className), ms);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (focused || still) return;
      // At most one update per frame, however fast the pointer moves.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => lookAt(event.clientX, event.clientY));
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement) {
        focused = event.target;
        update();
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (event.target === focused) {
        focused = null;
        update();
      }
    };
    const onInput = (event: Event) => {
      if (event.target === focused) update();
    };
    // Showing or hiding the password changes the input's type, not its value.
    const onClick = () => later(update, 0);
    const onReact = (event: Event) =>
      play(`owl-${(event as CustomEvent<OwlReaction>).detail}`, REACTION_MS);
    const onOwlClick = () => {
      play('owl-flying', FLAP_MS);
      play('owl-yes', REACTION_MS);
    };

    const blink = () =>
      later(
        () => {
          owl.classList.add('owl-blink');
          later(() => owl.classList.remove('owl-blink'), BLINK_MS);
          blink();
        },
        BLINK_MIN_GAP_MS + Math.random() * BLINK_GAP_SPREAD_MS,
      );
    if (!still) blink();

    if (lastReaction && Date.now() - lastReaction.at < REACTION_CARRY_MS) {
      play(`owl-${lastReaction.kind}`, REACTION_MS);
    }
    lastReaction = null;

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('input', onInput);
    document.addEventListener('click', onClick);
    window.addEventListener(REACTION_EVENT, onReact);
    owl.addEventListener('click', onOwlClick);

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('input', onInput);
      document.removeEventListener('click', onClick);
      window.removeEventListener(REACTION_EVENT, onReact);
      owl.removeEventListener('click', onOwlClick);
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
    };
  }, []);

  return ref;
}
