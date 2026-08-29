// The two section gates, in their own module rather than in `nav.ts`.
//
// THIS SPLIT IS A BUNDLE BOUNDARY, not tidying. `theme/myTerminal.ts` is shared
// with the public terminal (one set of customization rules over two navs), and
// it needs these gates — but importing them from `nav.ts` pulls the ENTIRE
// private `NAV` array into the public bundle with them, labels and all. That
// shipped once: "Live Trades", "Funded Trades", "Strategy Sessions", "Alert
// Settings" and "Developer Terminal" were all readable in the public JavaScript
// while no public screen could reach any of them. `nav.ts` re-exports both, so
// every existing importer is unchanged.
//
// Trading sections behind the nested Funded Account opt-in. The sidebar hides
// these unless the viewer has turned Funded on (which itself requires Advanced
// Trading); the demo never sees them.
export const FUNDED_ONLY_SECTIONS = new Set(['prop']);

// Sections behind the Trading Teams GRANT (`user.access.features.tradingTeams`).
//
// Hidden outright rather than drawn locked, which is the opposite of how the
// opt-in workspaces behave and is deliberate: a padlock advertises a feature,
// and the point here is that an ordinary account should not know teams exist.
// There is nothing to discover and nothing to buy — the grant is handed out by a
// software developer, so a lock icon would only invite a support ticket nobody
// can resolve with a payment.
//
// The server refuses every /api/my-portal/team* route on the same grant, so this
// is presentation only; the enforcer is requireTradingTeams.
export const TEAM_ONLY_SECTIONS = new Set(['my_team']);
