// The CONTENT scope — who owns a study game, a flashcard set, a presentation, a
// Market News channel list.
//
// This is deliberately NOT the same question as trading/scope.ts answers. That
// file decides whose *trade data* a viewer may see, and since 2026-08 the answer
// there is "their own, always". This one decides which shared library a user
// reads and writes, which still has a team dimension: a granted team builds
// study content together.
//
// WHY THIS EXISTS. Until now every team-scoped read used `users.team_id`
// directly, and `seedDefaultTeam()` adopted every account with no team into one
// shared "Vitalis Trading Team" on boot. That is harmless on a private terminal
// with a handful of invited users and indefensible the moment the public can
// sign up: every stranger would land in the same scope as every other stranger,
// sharing one study library they could each edit and delete, one channel list,
// and one chat room. The adoption is gone (see teams/service.ts) and a
// team-less account now resolves to a scope of its own instead.
//
// `user:<id>` is not a team and no `trading_teams` row exists for it. It is a
// scope KEY, stored in the same text column a team id is stored in, which is
// what lets a personal library and a team library share one table and one set of
// queries. Market News channels have worked this way since they were built; this
// module is that rule extracted so study content follows it too, rather than
// each surface inventing its own answer.
//
// Consequence worth stating: a user who is later granted a team does NOT bring
// their personal content with them, because the content is keyed on the scope it
// was created in. That is the safe direction to fail — content never leaks into
// a shared library by accident — but it means "move my games onto the team" is a
// deliberate copy, not something that happens on its own.

export interface ContentViewer {
  id: string;
  teamId: string | null;
}

/** The scope key owning this viewer's content: their team, or themselves. */
export function contentScopeId(viewer: ContentViewer): string {
  return viewer.teamId ?? `user:${viewer.id}`;
}

/** Whether a scope key is one person's private space rather than a real team. */
export function isPersonalScope(scope: string): boolean {
  return scope.startsWith('user:');
}
