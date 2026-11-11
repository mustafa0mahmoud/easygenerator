import { Owl } from '../../../components/ui/owl/Owl.tsx';
import { useFocusOnMount } from '../../../hooks/useFocusOnMount.ts';

const TITLE = 'Welcome to the application.';
const LETTER_DELAY_MS = 45;

const WORDS = TITLE.split(' ').reduce<{ letter: string; index: number }[][]>(
  (words, word) => {
    const start = words.flat().length + words.length;
    return [
      ...words,
      Array.from(word, (letter, offset) => ({ letter, index: start + offset })),
    ];
  },
  [],
);

export default function WelcomePage() {
  const titleRef = useFocusOnMount<HTMLHeadingElement>();

  return (
    <main className="flex flex-col items-center px-4 pt-[14vh] pb-10 text-center">
      <title>Welcome · Account</title>
      <Owl className="mb-6" />
      {/* Screen readers get the sentence once; the letters are decoration. */}
      <h1
        ref={titleRef}
        tabIndex={-1}
        aria-label={TITLE}
        className="m-0 text-[clamp(26px,4.4vw,40px)] leading-tight font-semibold tracking-[-0.01em] outline-none"
      >
        {WORDS.map((word, position) => (
          <span key={position} aria-hidden="true">
            <span className="inline-block whitespace-nowrap">
              {word.map(({ letter, index }) => (
                <span
                  key={index}
                  className="inline-block animate-drop"
                  style={{ animationDelay: `${index * LETTER_DELAY_MS}ms` }}
                >
                  {letter}
                </span>
              ))}
            </span>
            {position < WORDS.length - 1 && ' '}
          </span>
        ))}
      </h1>
      <div
        aria-hidden="true"
        className="mt-2.5 h-0.5 w-[min(520px,86%)] rounded-sm bg-line"
      />
    </main>
  );
}
