export type TypographyRole = 'body' | 'title' | 'control' | 'secondary';
/** User-approved role growth, not a cap: every role continues to respond.
 * Native OS accessibility scaling is independent and is never clamped. */
export function typographyRoleScale(percent: number, role: TypographyRole): number {
  const factor = Math.max(80, Math.min(200, Number.isFinite(percent) ? percent : 100)) / 100;
  const growth = {body: 1, title: 0.55, control: 0.45, secondary: 0.7}[role];
  return 1 + (factor - 1) * growth;
}
