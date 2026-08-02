# Investments — build notes

Running record of the Investments workspace build. Kept for the same reason the
Market Data and Market News notes are: the decisions that are invisible in the
code are the ones that get undone by the next person.

Started 2026-08-02, overnight session, branch
`claude/investments-workspace-auto-rhelsa`.

## What this workspace is, and the line it does not cross

A read-only, layman-friendly long-term portfolio tracker — 401(k), IRA, ESA,
brokerage. It **displays and educates**. It never places an order, never moves
money, and carries no personalized buy/sell/rebalance advice. That posture is not
decoration: it is what keeps the app in Apple's 3.2.1(viii) portfolio-tracker
lane and away from RIA/adviser exposure. Every advice-adjacent surface carries an
"informational only, not investment advice" line.

Consequences that show up in the code:

- **No credential column exists anywhere in the Investments tables.** Not unused,
  not nullable — absent. There is no table here that could hold a broker secret
  even if someone later wanted one to.
- **Allocation reports concentration as a fact, never as a recommendation.** It
  says "72% of your portfolio is in one holding", not "you should trim this".
- **Projections are arithmetic, not forecasts** — a compound-growth curve at a
  rate the user picks, labelled an estimate.

## The data model (migration `0087_investments.sql`)

Five tables, all owner-scoped by `user_id`. Unlike Trading, an investment account
is **personal**: there is no team column and nothing here is ever shown to a
teammate. `scopedTraderIds` deliberately does not appear in this workspace.

- `investment_accounts` — one per account tracked. `cash_balance` is uninvested
  cash: counts toward account value, is not a holding. `source` is `manual` for
  everything today; `plaid` / `snaptrade` are named now so wiring an aggregator
  later is a new **value**, not a new column.
- `investment_holdings` — a position in an account. **`symbol` is nullable on
  purpose**: 401(k) menus are full of collective trusts and target-date funds
  with a name and no public ticker, and refusing those would make the tracker
  useless for exactly the accounts it exists to serve. `name` always renders.
- `investment_transactions` — money in, out, and around. This is what makes
  Contributions & Goals and Dividends & Income *real* rather than estimated.
  Two deliberate choices: `symbol` is **denormalized** so a dividend keeps naming
  what paid it after the holding is sold and deleted (income history that
  vanishes when you close a position is worse than none), and `tax_year` is
  separate from `occurred_at` because a January contribution can be designated to
  the previous tax year — the annual limit is scored on the designation, not the
  calendar date.
- `investment_snapshots` — one dated reading of the **whole portfolio**, which is
  what Performance draws from. Whole-portfolio rather than per-account because an
  account opened last month would otherwise leave a hole in the history the day
  it appeared. Keyed on an ET calendar date (unique per user per day) so a day
  has one reading however often the screen is opened, and so the series means the
  same thing in any timezone — the same reason trade stamps are Eastern
  everywhere else. `contributed_to_date` is what makes the "what you put in vs.
  what the market did" split honest: without it, a rising line cannot be told
  from a line that rose only because money was added.
- `investment_goals` — a savings target, tied to one account or to the whole
  portfolio (`account_id` nullable).

All five are in the `admin/service.ts` per-user delete list, children first. The
foreign keys would cascade them anyway (verified: the app's libsql client runs
with `foreign_keys=1`), but the convention in that list is to state every table
explicitly rather than depend on it.

## Two migration facts worth knowing before you write the next one

1. **A migration file must be registered in `migrations/meta/_journal.json`** or
   drizzle never runs it. Adding the `.sql` file is not enough.
2. **Statements must be separated by `--> statement-breakpoint`.** Without the
   markers drizzle treats the file as one statement and **silently applies only
   the first**. This was caught here the hard way: `0087` initially created one
   table of five and reported success. If you add a migration, apply it to a
   scratch database and then list the tables — do not trust "Migrations applied."

Both of these bit pre-existing migrations too — see the Open questions below.

## Prices — what is live and what is not

The tracker needs a mark per holding. What is actually available to this install:

- **Crypto** — the existing keyless Coinbase/Kraken public feed. Live.
- **Equities/ETFs** — Finnhub, but only when `FINNHUB_API_KEY` is set (it is
  optional and today only feeds news). Live when the key exists, otherwise not.
- **Mutual funds / collective trusts / target-date funds** — no free provider
  covers these well, and they are the bulk of a 401(k). Not live.

So every holding reports **where its price came from**, and the screens say so.
A manual price is the user's own figure with the date they entered it; it is
never dressed up as a live quote. This mirrors the `sample: true` honesty rule on
the Market Data board — keep it accurate when a provider is wired.

**Do not try Stooq for quotes.** CLAUDE.md records it was tried twice for the
metals and does not answer a server.

## Open questions for the owner

- **Aggregator.** Real 401(k)/IRA connection needs Plaid or SnapTrade: an account,
  paid keys, and (for Plaid) a production access request. Nothing here can be
  built past manual entry without that. The `source` column is ready for it.
- **Market data provider.** Same shape of decision for fund and equity prices.
- **Pre-existing migration defects found while working here, deliberately not
  touched.** They are unrelated to Investments, and fixing them means running
  unreviewed data migrations on production in the middle of the night. Audited
  every migration in the tree; exactly four are affected, and only the first two
  have consequences that are still live:

  | migration | what did not run | consequence |
  |---|---|---|
  | `0083_user_features` | the grandfathering `INSERT` | **Likely real.** Every pre-existing account was meant to be carried into Advanced Trading with a stamped acknowledgement. It was not, so those users have no `user_features` row and read `advancedTrading: false` — i.e. they lost the desk on that deploy until they re-opted in from Feature Access. `seed.ts` covers only the first-boot owner, so the owner's own account is fine; anyone else invited before that deploy is not. |
  | `0084_market_news_channels` | `CREATE UNIQUE INDEX … (team_id, key)` | **Real but minor.** The per-team uniqueness of a Market News channel is not enforced in the database, so duplicate channel rows are possible. |
  | `0085_connection_labels_name_the_venue` | 3 of 4 statements | **Harmless.** CLAUDE.md already states this migration is not the enforcement — `backfillConnectionLabels()` re-applies it on every boot, which is why the labels are correct anyway. |
  | `0086_market_news_channel_repair` | all of it (not in the journal) | **Superseded.** The starter channel ids it would have backfilled are now seeded outright, and the background resolver fills any gap. Worth deleting the file or registering it, but nothing is broken. |

  Recommended fix, when the owner wants it, is a **new** migration rather than
  editing these: the old ones are recorded as applied, so amending them changes
  nothing on a database that has already seen them.
