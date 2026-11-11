export type OwlReaction = 'yes' | 'no';

export const OWL_REACTION_EVENT = 'owl:react';

export const isOwlReaction = (value: unknown): value is OwlReaction =>
  value === 'yes' || value === 'no';

export const PASSWORD_FIELD_ATTRIBUTE = 'data-password-field';

const REPLAY_WINDOW_MS = 1_500;

let lastReaction: { kind: OwlReaction; at: number } | null = null;

export function owlReact(kind: OwlReaction): void {
  lastReaction = { kind, at: Date.now() };
  window.dispatchEvent(
    new CustomEvent<OwlReaction>(OWL_REACTION_EVENT, { detail: kind }),
  );
}

export function takeRecentOwlReaction(): OwlReaction | null {
  const reaction = lastReaction;
  lastReaction = null;
  if (!reaction || Date.now() - reaction.at >= REPLAY_WINDOW_MS) return null;
  return reaction.kind;
}
