/**
 * The deploy control's colours.
 *
 * Andrew asked for Railway's, because that is the interface he already reads
 * "there are changes staged, press this to apply them" from. Borrowing the
 * colour borrows the habit.
 *
 * NOT IN theme/tokens.ts, deliberately. That file is mirrored byte-for-byte
 * into the public site (see verify:mirror), so anything added to it has to be
 * carried across too — and the portfolio has no deploy button and never will.
 * A local module is the right home for a colour only this app uses.
 */
export const DEPLOY = {
  /** The button. */
  bg: '#7A5AF8',
  bgHover: '#8B6EFF',
  text: '#ffffff',
  /** The "N changes staged" line beside it. */
  accent: '#B69BFF',
  tint: 'rgba(122,90,248,.14)',
  line: 'rgba(122,90,248,.42)',
} as const;
