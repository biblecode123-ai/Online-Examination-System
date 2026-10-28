/** Presentation helpers shared by the student portal pages. */

export function dateLabel(
  value: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en', opts).format(date);
  } catch {
    return '—';
  }
}

/** HH:MM:SS for a countdown. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "45 minutes" / "1 hour 30 minutes" from the backend's official minutes. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} minute${total === 1 ? '' : 's'}`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} hour${hours === 1 ? '' : 's'} ${rest} min` : `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

const ANSWER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Parse a matching answer (`{"CPU":"Central processing unit", …}`) into its
 * ordered left→right pairs. Returns null for anything that is not a non-empty
 * object of string values, so callers keep their plain-text rendering for
 * every other question type. */
export function parseMatchingAnswer(text: string | null | undefined): [string, string][] | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const pairs = Object.entries(parsed as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );
  return pairs.length > 0 ? pairs : null;
}

/**
 * Render a matching answer inside review rows:
 * `CPU → B. Central processing unit · RAM → A. Temporary memory`.
 *
 * `rightOrder` is Column B's stored order (from the question's `options`, or
 * from `matching_data.right_options` where the endpoint exposes it). When no
 * order is available a pair keeps its plain text — an invented letter would
 * contradict the A/B/C the student actually saw.
 *
 * Returns null when `text` is not a matching map (callers fall back to the
 * raw value they already display).
 */
export function formatMatchingAnswer(
  text: string | null | undefined,
  rightOrder?: readonly string[] | null,
): string | null {
  const pairs = parseMatchingAnswer(text);
  if (!pairs) return null;
  return pairs
    .map(([left, right]) => {
      const index = rightOrder ? rightOrder.indexOf(right) : -1;
      const letter =
        index >= 0 ? `${ANSWER_LETTERS[index % ANSWER_LETTERS.length]}. ` : '';
      return `${left} → ${letter}${right}`;
    })
    .join(' · ');
}
