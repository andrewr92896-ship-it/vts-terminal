# Open Business & Legal Questions — Vitalis Trading Systems

**Review date:** 2026-08-22 · **Commit:** `97cf53d`

These are the facts the code cannot establish. Each question states **why the code raised it** so counsel can see which technical finding it attaches to. Nothing here is a legal conclusion.

---

## 1. Business entities

1. Which legal entities exist today, and which one operates the terminal? The only entity named in code is **Vitalis Trading Systems LLC, Ohio** (`apps/web/src/legal/content.ts:18-25`). Is it formed and in good standing?
2. Is **Vitalis Wealth Management** a separate legal entity, and does it exist yet? The repo contains only dead remnants (`apps/api/src/demo/demo.ts:63-64,117-118`) and a stale document describing it as an RIA portal sharing this codebase and database (`HANDOFF.md:32-34,88-96`).
3. Will Vitalis Wealth Management reuse this codebase, this database, this Railway project, this GitHub org, or this Anthropic/OANDA account? **Today it would inherit all of them**, because there is exactly one deployable unit and one database.
4. Are there shared employees, contractors, expenses, or bank accounts between the two?
5. Who owns the intellectual property in this repository? There is **no LICENSE file and no contractor IP assignment** anywhere in the repo.

## 2. Partner relationships

6. Who are the "partners"? In code they are accounts holding the `founder` or `software_developer` role (`apps/api/src/trading/founderTrades.ts:82-98`). Are they equity owners, employees, contractors, friends, or outside investors?
7. Is there a **written partnership or operating agreement**? None exists in the repo.
8. Founder trade coordination (`F-05`/`F-06`) lets one partner's fill automatically raise an invitation that another partner joins with one press, copying the inviter's stop and take-profit. **Is either party compensated** — in cash, profit share, equity, or anything else — for that signal?
9. Are there partners who are *not* founder-level but sit in a private group and can see each other's live positions when the grant is held (`apps/api/src/trading/scope.ts:103-107`)?

## 3. Account ownership and trade authority

10. Are the trading accounts connected to the terminal **individually owned**, or is any of them **company-owned**? The code cannot tell: a connection is just a credential plus a label (`apps/api/src/trading/connections.ts:453-560`).
11. Is any OANDA connection pointed at a **live** account, or are they all practice? The code supports both (`apps/api/src/trading/config.ts:54-59`) and stores the answer in `broker_connections.summary`.
12. Does anyone hold **power of attorney or discretionary authority** over anyone else's account? No code path allows it — every desk write resolves through `getActiveDecrypted(callerId)` (`apps/api/src/trading/orderDesk.ts:29-42`) — but that is a technical fact, not a legal one.
13. Is there a **prop-firm (Funded Trading Plus) account**, and whose capital is it? The terminal tracks it by hand and by screenshot only.
14. Does the group accept, pool, or hold **outside capital**? Nothing in the code does, but nothing in the code would show it either.
15. How are gains and losses allocated between the partners?

## 4. Compensation and revenue

16. What are the intended subscription plans and prices? **No billing exists**: no Stripe, no StoreKit, no PayPal, no trial, no coupon, no dunning, no cancellation flow. Tiers are granted by hand (`apps/api/src/memberships/tiers.ts:75-140`; `user_memberships.source` never takes the value `'billing'`, `apps/api/src/db/schema.ts:2715-2716`).
17. Will any fee ever be **based on profits, account size, transaction count, trading volume, or referrals**? None exists today (a scan for affiliate/referral/commission/profit-share finds only `funded_accounts.commission_per_lot`, a trader-stated prop-firm rate used in a cost calculation).
18. Will Vitalis receive compensation from **OANDA, Kraken, TradingView, or any data provider**?
19. Will there be affiliates or influencer promotion?

## 5. Public customer features — decisions the code is waiting on

20. **Will public customers connect their own broker accounts?** Today they can (Max tier). An OANDA personal access token **can place orders**; there is no read-only variant (see §7).
21. **Will the Trade Desk ship to the public?** It is Max-tier today and reachable by any account that pays for it. It is a Level 5 surface: order placement, close, amend, cancel.
22. Will the Trade Desk ship in the **iOS app**? `AGENTS.md` already identifies Guideline **3.2.1(viii)** as the blocker.
23. Will public customers be able to reach **Trading Notes** (forward-looking directional calls shared to a group, with a settled hit rate)? It is Premium today.
24. Will public customers be able to reach **Strategy Sessions** (a stored Bull/Bear bias per time window)? Premium today.
25. Will the **funded-account AI coaching brief** ship publicly? It sends the caller's live drawdown state to Claude and the prompt asks for "disciplined next steps" (`apps/api/src/ai/prompts.ts:102-103`).
26. Should the **founder-trade workflow** be excluded from a public build entirely? It is currently compiled into the public bundle and gated only by a role check.
27. Will customers ever see **another customer's** trades or performance? Only on a granted team today.

## 6. Instruments, markets and jurisdictions

28. Which instruments will public customers trade or track — **retail forex, CFDs, spot crypto, futures, equities**? The code touches forex and metals/indices via OANDA (CFD), and spot crypto via Kraken.
29. Which **countries and U.S. states** will customers be accepted from? There is no geo-gating, no state field, no KYC and no residency check anywhere in the codebase.
30. Will the terminal be offered to non-U.S. users? There is no GDPR/UK-GDPR consent mechanism, no cookie banner, no DSAR path and no data-export endpoint.

## 7. Broker permissions — needs written vendor confirmation

31. **OANDA:** confirm in writing that a personal access token cannot be scoped read-only, and what the v20 API terms say about a third-party application placing orders on a customer's behalf. `AGENTS.md` already states "OANDA tokens can trade — treat with care".
32. **OANDA:** confirm the terms for using a *practice* account purely as a market-data source for all users (`apps/api/src/trading/config.ts:75-87`).
33. **Kraken:** confirm the minimum key permissions the desk actually needs (Query funds, Query open orders & trades, Create & modify orders — explicitly **not** margin) and that this satisfies Kraken's API terms for a third-party front end.
34. Do either broker's terms require the end user to have a **direct agreement** with Vitalis, or disclosure that a third party holds their key?

## 8. Market data and content licensing — needs written vendor confirmation

35. **TradingView:** the app loads the free embeddable widgets from `s3.tradingview.com` (`apps/web/src/workspaces/trading/ChartTile.tsx:28`; `WatchlistTile.tsx:19-20`). Confirm the free-widget terms permit use inside a **paid subscription product**, and what attribution/branding is required. No Charting Library or datafeed is used.
36. **FRED:** confirm redistribution terms for displaying transformed series (YoY, deltas, QoQ SAAR) to paying subscribers (`apps/api/src/trading/marketMacro.ts`).
37. **OANDA pricing:** confirm terms for displaying OANDA-sourced spot prices and derived change columns on a board shown to all users.
38. **News publishers** — Reuters, AP, CNBC, Dow Jones, MarketWatch, CoinDesk, Cointelegraph, FXStreet: confirm RSS redistribution rights for reproducing headlines and excerpts inside a paid product (`apps/api/src/trading/feeds.ts`).
39. **Truth Social:** the terminal polls an unofficial public API (`apps/api/src/trading/feeds.ts:777-782`). Confirm this is permitted.
40. **YouTube:** the keyless live-detection path fetches watch and embed pages with browser-like headers and a `CONSENT` cookie (`apps/api/src/trading/youtube.ts`). Confirm this is compatible with YouTube's Terms of Service; the Data API path is separately quota-metered.
41. **Finnhub:** confirm the licence tier permits displaying quotes to paying subscribers.

## 9. Performance claims and displays

42. The Trade Log computes **win rate and profit factor** from OANDA's `realizedPL`, which **excludes financing and commission** (`apps/api/src/trading/brokers/oanda.ts:100-133`; `apps/web/src/workspaces/trading/tradeStats.ts:82-120`). Will these figures ever be shown outside the trader's own account, exported, or used in marketing?
43. The public demo shows **invented positions with invented P/L** (`apps/api/src/trading/sample.ts:11`). Is the "sample" labelling sufficient?
44. **Trading Notes** keeps a calibration table of stated confidence vs. realised hit rate (`apps/api/src/trading/notes.ts:371-410`). Is that an implied track record when shared to a group?
45. The **study leaderboard** is a public ranked list of display names and accuracy percentages spanning the whole install, default opt-**in** (`users.hide_from_leaderboards` defaults off). Is that acceptable once the public is on the install?
46. Will testimonials, backtests, hypothetical results or partner track records ever be published? None exist in code today.

## 10. Subscriptions and consumer terms

47. Since billing is unbuilt: which processor for web, and does the iOS app require **StoreKit auto-renewable subscriptions**?
48. Auto-renewal disclosure, price/terms/cancellation before purchase, free-trial rules, refund policy, and negative-option/ROSCA compliance — none of these exist as code or as documents.
49. Cancellation must terminate access; today there is no cancellation path at all, and a lapsed tier is enforced only by `hasEntitlement` on each request.

## 11. Privacy, security and records

50. **In-app account deletion does not exist** (`apps/api/src/routes/auth.ts` has no delete route; only `DELETE /api/admin/users/:id`). App Store Guideline **5.1.1(v)** requires it.
51. **No data export / portability endpoint exists.**
52. `credential_audit` and `employee_audit_log` **deliberately survive account deletion** (`apps/api/src/admin/service.ts:493`), and `credential_audit` retains the requester's IP. This must be disclosed in the Privacy Policy and given a retention period — nothing prunes either table.
53. Broker/prop-firm **screenshots containing balances and account identifiers are sent to Anthropic** (`apps/api/src/ai/claude.ts:188,244,319`). Confirm Anthropic's retention terms and whether a DPA/zero-retention arrangement is needed. The Privacy Policy mentions AI providers generally but not image uploads specifically.
54. AI conversations that trip the advice guardrails are **stored and reviewable by admins** (`apps/api/src/ai/violations.ts`). Disclosed in `AI_PRIVACY_NOTICE` (`apps/api/src/ai/guardrails.ts:64-65`) — confirm that is sufficient.
55. Who handles support, and who can see customer financial data? Any admin can read every broker connection, every user record, and the whole credential audit.
56. Is cyber / E&O / tech insurance planned? `AGENTS.md` flags it; nothing else evidences it.
57. Is there an incident-response plan, a security policy, or a records-retention policy? **None exists in the repo.**
58. Backups: where does the Railway volume back up to, who can restore it, and does a restore reintroduce deleted accounts?

## 12. Questions that need an attorney

59. Does the Trade Desk — sending customer orders to the customer's own broker under the customer's own credential, with no custody of funds — implicate **broker-dealer, introducing-broker, or CFTC/NFA registration** (retail forex; Kraken spot crypto)?
60. Does **founder-to-founder trade coordination** (F-05/F-06) constitute providing trading advice or signals, and does it change character if a partner is compensated?
61. Does **Trading Notes**, shared to a group with a settled hit rate, constitute investment advice or an implied track record?
62. Does the **AI coaching brief** on a live funded account cross into personalised advice notwithstanding the guardrails?
63. Does the **Strategy Session bias** constitute a recommendation?
64. Does a paid subscription that includes trade-signal dissemination (the TradingView webhook fan-out, F-09) implicate **CTA/RIA** status?
65. What disclosures must appear before the Trade Desk is offered publicly, and where?
66. Which state money-transmission or investment-adviser registrations are implicated by the intended customer footprint?
67. Does the **iOS listing** satisfy Guideline 3.2.1(viii), or must order placement be excluded from the native shell?
68. Must the **Terms and Privacy Policy be corrected before the next public sign-up**, given that both describe the product as "read-only" while it places live orders (`apps/web/src/legal/content.ts:84,567,593-595`)?

## 13. Questions needing written vendor confirmation (summary)

| Vendor | Confirm |
|---|---|
| OANDA | token scoping; third-party order placement; practice account as a data source |
| Kraken | minimum key permissions; third-party front-end terms |
| TradingView | free widgets inside a paid product; attribution; webhook use |
| FRED | redistribution of transformed series to subscribers |
| Finnhub | licence tier for subscriber display |
| Reuters / AP / CNBC / Dow Jones / MarketWatch / CoinDesk / Cointelegraph / FXStreet | RSS headline redistribution in a paid product |
| YouTube | keyless live-page reads with browser-like headers; embed terms |
| Truth Social | unofficial API polling |
| Anthropic | retention and DPA for broker screenshots and chat |
| Pushover / Resend | DPA; data handled |
| Railway | data residency, backup retention, sub-processor list |
