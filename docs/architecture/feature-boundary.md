# Feature boundary

This matrix classifies the implementation at commit `444f709`. Paths identify ownership; they do not imply that a feature is licensed or approved.

## Public application

| Feature | Current assignment | Source |
| --- | --- | --- |
| Marketing and customer entry | Public marketing | `apps/marketing/src/index.html` |
| Customer application shell | Public terminal | `apps/public-terminal/src/index.html` |
| Customer authentication | Excluded until separate auth exists | Not implemented |
| Customer database/API | Excluded until separate resources exist | Not implemented |
| Early-access intake | Candidate for a future public API | Historical private source: `apps/api/src/routes/earlyAccess.ts` |
| Read-only demo | Excluded because the existing demo exposes the private application shape | `apps/api/src/demo`, `apps/web/src/pages/Login.tsx` |

The public build currently contains no private business feature. Customer features should be moved one at a time only after their server and data ownership are public-specific.

## Private portal

> **INTERNAL ONLY — PENDING LEGAL AND COMPLIANCE REVIEW**

| Feature | Source |
| --- | --- |
| Named-account authentication, RBAC and sessions | `apps/api/src/auth`, `apps/api/src/routes/auth.ts` |
| User and internal administration | `apps/api/src/admin`, `apps/api/src/routes/admin.ts`, `apps/web/src/workspaces/admin` |
| Partner/team membership and grants | `apps/api/src/teams`, `apps/api/src/userTeams`, `apps/web/src/workspaces/trading/TradingTeam.tsx` |
| Partner chat and announcements | `apps/api/src/chat`, `apps/api/src/routes/chat.ts`, `apps/web/src/components/TeamChat.tsx` |
| Founder trade invitations and distribution | `apps/api/src/trading/founderTrades.ts`, `apps/api/src/routes/founderTrades.ts` |
| Broker connections and credentials | `apps/api/src/trading/connections.ts`, `apps/api/src/security` |
| OANDA/Kraken order placement, changes and closing | `apps/api/src/trading/brokers/oandaOrders.ts`, `apps/api/src/trading/brokers/krakenOrders.ts`, `apps/api/src/routes/tradeDesk.ts` |
| Trade Desk, private positions and performance | `apps/api/src/trading`, `apps/web/src/workspaces/trading` |
| Private notifications and trade alerts | `apps/api/src/notifications`, `apps/api/src/routes/notificationPrefs.ts` |
| AI screenshot analysis and internal prompts | `apps/api/src/ai`, `apps/api/src/routes/ai.ts` |
| Employee Portal | `apps/api/src/employee`, `apps/api/src/routes/employee.ts`, `apps/web/src/employee` |
| Developer Terminal and internal content controls | `apps/api/src/devBlog`, `apps/api/src/routes/dev.ts`, `apps/web/src/workspaces/admin` |

## Shared neutral packages

None are shared across the public/private build boundary yet. This is deliberate: starting with zero cross-boundary imports is safer than prematurely extracting code that may carry private assumptions.

Future candidates include generic date/number formatting, neutral brand tokens, accessible form primitives and generic chart rendering. Any package must be free of private route names, roles, broker types, database configuration and business logic before public use.

## Excluded pending legal or vendor review

> **INTERNAL ONLY — PENDING LEGAL AND COMPLIANCE REVIEW**

- Trade execution, order modification, cancellation and position closing.
- Founder/partner trade distribution, copy or mirror workflows.
- Personalized recommendations and customer-specific position sizing.
- Private strategies, signals and partner performance.
- Trade-capable broker-token collection.
- Market-data redistribution without confirmed commercial licensing.
- Subscription, performance-fee or entitlement behavior that has not completed product/legal review.

These features remain in the private deployment. Their classification is a technical boundary, not legal or regulatory approval.
