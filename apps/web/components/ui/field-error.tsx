import type { FieldError as RhfFieldError } from 'react-hook-form';

/** One line of validation text under an input. Renders nothing when valid. */
export function FieldError({ error }: { error?: RhfFieldError }): React.JSX.Element | null {
  if (!error?.message) {
    return null;
  }

  return <p className="text-xs text-destructive">{error.message}</p>;
}
