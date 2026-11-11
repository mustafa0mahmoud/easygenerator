export type OwlReaction = 'yes' | 'no';

export const OWL_REACTION_EVENT = 'owl:react';

export const isOwlReaction = (value: unknown): value is OwlReaction =>
  value === 'yes' || value === 'no';

export const PASSWORD_FIELD_ATTRIBUTE = 'data-password-field';

const REPLAY_WINDOW_MS = 1_500;

let lastReaction: { kind: OwlReaction; at: number } | null = null;

/**
 * Forms report an outcome here without knowing where, or whether, an owl is
 * on the page.
 */
export function owlReact(kind: OwlReaction): void {
  lastReaction = { kind, at: Date.now() };
  window.dispatchEvent(
    new CustomEvent<OwlReaction>(OWL_REACTION_EVENT, { detail: kind }),
  );
}

/**
 * A reaction fired just before a page change would be lost with the old
 * page's owl, so the next owl asks for it once when it appears.
 */
export function takeRecentOwlReaction(): OwlReaction | null {
  const reaction = lastReaction;
  lastReaction = null;
  if (!reaction || Date.now() - reaction.at >= REPLAY_WINDOW_MS) return null;
  return reaction.kind;
}
