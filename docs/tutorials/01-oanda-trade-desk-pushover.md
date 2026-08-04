# Tutorial 1 — Connect OANDA, place a trade, set up Pushover

Internal, pre-launch. Made for Moody and Dale only.

This is an **outline**, not a word-for-word script — beats to hit, where to click,
and roughly what to say at each one. Everything below has been checked against
the current code, so the labels and button names are what will actually be on
screen.

---

## Before you record — prep

**1. Their accounts need Max.** All three things this video teaches are Max-tier
features: the Trade Desk, broker connections, and Pushover. On a Free account
Moody and Dale will not see a Trade Desk row at all and will hit an upgrade
notice where the Pushover key box should be. Grant Max from **Admin Terminal ▸
Users** before they watch, or give them admin / software developer roles (those
resolve to Max automatically with no stored grant).

**2. Viewing as a role.** Account menu (your name, top right) → **View as role** →
**Member**. That hides the Admin and Developer Terminals so the sidebar looks
like theirs. Worth knowing: it does **not** drop your membership — you stay Max,
so no paywall prompts will appear while you record. If you want to show what a
locked feature looks like, that needs an actual tier change, not the role
preview. Getting back out is the same menu → **My access**.

**3. OANDA tab.** Have your practice account open in a second tab. Blur in post:
the API token, the account ID, your OANDA account numbers, and anything in the
**Credential use** log if you scroll it.

**4. Suggested recording order.** Do the OANDA side first, then the terminal
connection, then the trade, then notifications. Each part stands on its own if
you want to cut them into separate clips later.

---

## 0. Open — the format (~1 min)

- This is the first of a series of walkthroughs. Same format each time: screen
  recording, one job per video, start to finish.
- This one is **internal only** — for the dev team, not for customers. Nothing
  here goes public.
- **These aren't the real tutorials.** The customer-facing videos get made once
  the site is finished; the terminal is still moving underneath us, so treat this
  as "here's how to use what we've got today."
- Say **terminal**, not portal. We dropped "portal" — it's the VTS Terminal, My
  Terminal, Admin Terminal, Developer Terminal. (The one exception is the
  Employee Portal, which is a separate site and keeps its name.)

## 0b. What the diamonds and stars mean (~45 sec)

Do this early — the marks are all over the sidebar and they'll ask.

- **Diamond** = **Max**, the top subscription tier.
- **Star** = **Premium**, the tier below it.
- **No mark** = included with every account, free.
- The mark says what a feature **costs**, not that you're locked out — you'll see
  diamonds beside things you can use perfectly well. Everyone sees them.
- Point at a few live examples as you talk: **Trade Desk** and **Trading Team**
  in the sidebar carry diamonds, **Market Data** and **Strategy Sessions** carry
  stars, **Market News**, **Live Wall** and **To Do** carry nothing. Same marks
  turn up on the Ask VTS AI button, the **Live Brokers** tab, the Pushover row in
  Settings, and on the tiles in the Live Wall's tile picker.
- Mention: everything in this video is a **diamond** feature.

---

## 1. Getting your API key out of OANDA (~2–3 min)

On your OANDA tab.

- **Practice or live — decide first.** Demo and live are separate logins and
  separate tokens. A demo token will not work against a live account or the other
  way round, and that mismatch is the single most common reason a connection
  comes back red. For this video use **practice**.
- **Where the token lives.** OANDA has moved this around, so show both doors:
  - In the hub: **Tools → API → Generate**.
  - Or from your profile: **My Account → My Services → Manage API Access**.
- Generate it. It looks like `123456789abcdef0-123456789abcdef0`. Copy it.
- Say plainly: **this is generated once and shown once.** If you lose it you
  generate a new one, which revokes the old.
- **Grab the Account ID too.** This is the **v20 account number** — the long
  hyphenated one, `101-001-1234567-001` on practice, `001-001-1234567-001` on
  live. Find it under **Accounts** in the hub, and it's usually shown on the same
  Manage API Access page as the token. You need both pieces.
  - Call out the trap on camera: OANDA also shows a **short** account number like
    `1234567`, and that is not the one — it's the middle chunk of the long one.
  - Good sanity check: the first block says which side you're on. `101-` is
    practice, `001-` is live. If it doesn't match the Practice/Live dropdown, the
    connection comes back red.
  - One token covers all your sub-accounts, so the account ID is what decides
    which one actually gets traded.
- Two things to say out loud while it's on screen:
  - A token can **trade**, not just read. Treat it like a password. Anyone with
    it can place orders on that account.
  - You can **revoke** it from the same page at any time, which kills the
    connection instantly.

---

## 2. Linking it to the terminal (~3–4 min)

### Step zero — turn the desk on

New accounts start with everything optional switched off, so this trips people
up.

- **My Terminal ▸ Premium Features**.
- Explain the screen briefly: your **membership** is what you're allowed to use,
  the **switches** are what you've asked to see. Holding Max doesn't turn the
  desk on for you.
- Toggle **Advanced Trading**. A panel comes up — read it on camera, it's short
  and it's the point: the desk places **real orders** with your own broker, the
  terminal never holds your money, and none of it is investment advice. Click
  **I understand — turn it on**.
- Show the sidebar gaining the **Advanced Trading** workspace.
- Mention **Funded Account** sits underneath it and stays greyed until the desk
  is on — that's the prop-firm tracker, not part of this video.

### Add the connection

- **Advanced Trading ▸ Trade Desk**. With nothing connected you get "No
  tradeable account connected" and an **Add a connection** button — use it.
- Note the other doors while you're there: the **Connections** button top-right
  of the Trade Desk, the same button on the **Live Wall**, and **My Terminal ▸
  Settings → Notifications & connections → Broker connections**. All the same
  panel.
- Fill the form in order:
  - Broker dropdown → **OANDA v20 (forex)**. (Kraken and Manual are the other
    two — one line on each is enough.)
  - **Name it** — the placeholder says it: whose and where, e.g. "Dale's OANDA".
    If the name doesn't say which platform it is, the terminal appends it, so two
    accounts can never end up looking identical.
  - **OANDA API token** — paste. It's a password field, and it's encrypted on the
    server; the browser never gets it back.
  - **Account ID** — paste.
  - **Practice / Live** — set it to match where the token came from. Call this
    out again.
  - **Add connection**.
- Show the row that appears. Point at the **dot**: green is reading fine, red
  means it couldn't connect and the reason sits right there in the row. **Pause**
  stops it being read without deleting it; **Edit** lets you re-paste a rotated
  token (leave the credential fields blank and it keeps the existing key); **×**
  removes it.
- Show the **count trades since** row underneath — sets a cutoff so your history
  starts on a date you choose instead of dragging in everything the account has
  ever done.
- Scroll to **Credential use**. This is worth thirty seconds: every time your key
  is used and what for — orders, desk opens, balance reads — background polling
  counted by the hour rather than listed one by one. It's your own only; nobody
  else on the team can see it, not even a team leader.
- Then show where the money lands: the **account card** at the top of the Trade
  Desk, and **Advanced Trading ▸ Trade Analysis ▸ Live Brokers** for NAV,
  balance, open P/L and what the account has made over today / this week / 30
  days.

---

## 3. Placing a trade (~5–6 min)

Stay on **Advanced Trading ▸ Trade Desk**.

### The layout, quickly

- **Account cards across the top** — one per connected account. Each shows the
  name, a **PRACTICE** or **LIVE** pill, the venue (OANDA · FOREX), the account
  value, the last digits of the account number, how many positions are open and
  free margin. Click one to trade with it. Whichever you pick is the one that
  gets the order.
- **Ticket on the left, everything you watch while filling it on the right**: your
  team's open positions, holdings, resting orders, and the order journal.
- Say why the book is beside the ticket: you shouldn't be sizing a EUR/USD long
  without seeing that two teammates are already short it. You can **watch** the
  team's book, you can only **trade your own account** — there's no path in the
  terminal to place an order on somebody else's.

### The ticket, top to bottom

- **PRACTICE / LIVE MONEY** pill — first thing to look at, every time.
- **Instrument** — searchable dropdown, type "EUR" to filter. The list is what
  *that account* can actually trade, so it changes when you switch accounts.
- **Sell | SPREAD | Buy** — one control, not two. The left price is the bid, the
  right is the ask, the spread in pips sits between them. Clicking the side you
  want is the same act as reading its price. It says **CLOSED** here when the
  market's shut.
- **Order type** — Market fills now, Limit rests until price comes to you, Stop
  triggers when price trades through your level. Pick Limit or Stop and a trigger
  price box appears.
- **Size** — units. Underneath it tells you what one pip is worth at that size
  (points, not pips, on indices, metals and crypto — a pip is a forex thing).
- **Risk** box beside it — type what you're willing to lose, hit **Size**, and it
  works the units out for you. Greyed until you've set a stop, because it has
  nothing to measure from.
- **Quick chips** — 1k, 5k, 10k and so on, bounded by what the broker will
  actually accept.
- **Stop loss** and **Take profit** — under each one it shows the money and the
  pips, priced off the side of the book your order will actually pay.
- **Summary row** — entry, position value, estimated margin against your free
  margin, and risk/reward as an R number.

### The two-step send

Make this the point of the whole section:

- **The big button never sends an order.** It either says **Review buy 10k
  EUR/USD**, or it tells you what's wrong — stop on the wrong side of the entry,
  size under the minimum, market closed. Demo one deliberately: put a long's stop
  *above* the entry and read the button back.
- Press Review. The panel states the order in **one sentence**, names the account
  and its last digits, and tells you roughly what you're risking in money. On a
  **live** account it turns red and the button reads **Confirm — live order**.
- **Cancel** or **Confirm order**. Confirm it.
- Show the result banner — filled at a price, or "working" if it's a resting
  order — and the position appearing in the book below.

### Managing it

- **Close** whole or partial, **amend** the stop or target on a running trade,
  and **cancel** a resting order from the **Working orders** panel.
- **Order journal** — every attempt, including the ones the broker refused and
  why. A rejected order never becomes a position, so this is the only record it
  happened.
- One line if you want it: crypto goes through Kraken and is **spot only** — you
  buy the coin outright, no leverage, no shorting.
- Lead into the next section: **no notification fires the instant you place**.
  The desk reconciles about every ten seconds and the "trade opened" push comes
  from there — which is what Part 4 is about.

---

## 4. Notifications — phone alerts and Pushover (~4–5 min)

**My Terminal ▸ Settings**, then the **Notifications & connections** panel.

Frame it as two separate channels, because they are:

- **Phone notifications** — free with every account, web push, per device.
- **Pushover** — Max, and what it buys you is a **loud custom sound** you can't
  miss. Not the notification itself.

### Phone notifications first

- **Turn on phone alerts** → allow the browser prompt → **Send test**.
- Say the iPhone rule clearly: it only works if the terminal is **added to the
  Home Screen** (Share → Add to Home Screen) and opened from that icon. In plain
  Safari the button will tell you the device can't do it.
- It's **per device** — turn it on again on the laptop, the phone, wherever.

### Then Pushover

- Install the app — the **App Store and Google Play icons are right there** in
  the panel. Make a free Pushover account.
- Find your **User Key**: it's on the Pushover app's home screen, and on
  pushover.net if you're on the desktop.
- Paste it into **Your Pushover user key** → **Connect Pushover**. It fires a
  test automatically, so their phone should buzz on camera.
- After that you get **Send test** and **Disconnect**.
- **Pick the sound inside the Pushover app**, not in the terminal — you can
  choose one of theirs or upload your own.
- Worth saying: disconnecting is never blocked, whatever your tier. Your key,
  your call.

### Choose what buzzes you

- **Notify me about a trader** — pick which teammate you want to hear about, and
  which of the six events: placing a trade, closing, placing or moving a stop,
  placing or moving a target. Everything defaults **on**, so this only ever mutes.
- What actually sends: trade opened, trade closed, stop or target placed/moved,
  and new TradingView alerts. **Team chat doesn't push** — that's the bell in the
  top bar.
- Optional, if the video isn't already long: the **Home Screen widget** section
  below it, for open positions at a glance.

---

## 5. Close (~30 sec)

- Recap the three: key from OANDA → connection in the terminal → order through
  the ticket → notifications on the phone.
- Reminder it's a **practice** account throughout, and to keep it that way until
  they're comfortable.
- Where to shout: the chat bubble bottom right, or **Site Help ▸ Report a bug**.
  Bug reports are free on every account, deliberately.
- Site isn't finished. Things will move. More videos when it is.

---

## Gotchas worth saying on camera

- Demo token + Live setting (or the reverse) = red dot. Match them.
- Nothing appears until **Advanced Trading** is switched on in Premium Features.
- The token can trade. It is not a read-only key, and it can't be one if you want
  the desk to work.
- The first button on the ticket is a review, not a send. Nothing leaves the
  terminal until the second one.
- Notifications are per device on the web push side, per account on Pushover.
- On iPhone, no Home Screen icon means no push. It's not broken.
