import { PASSWORD_RULES } from '../schemas/authSchemas.ts';

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul
      aria-label="Password rules"
      className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] max-[460px]:grid-cols-1"
    >
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.id}
            data-met={met}
            className={`flex items-center gap-2 transition-colors ${met ? 'text-ink' : 'text-ink-muted'}`}
          >
            <span
              aria-hidden="true"
              className={`size-2 flex-none rounded-full border-[1.5px] transition-colors ${met ? 'border-ink bg-ink' : 'border-ink-dim'}`}
            />
            {rule.label}
            <span className="sr-only">{met ? '(met)' : '(not met yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
