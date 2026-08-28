-- Public-only database migration. Apply only through PUBLIC_DATABASE_URL.
--
-- Personal to-do for a public account. The public terminal renders the portal's
-- own To Do component, so the stored shape and the display rules are the private
-- side's (apps/api/src/todo/service.ts) rather than a second set.
--
--   * SECTIONS ARE SEEDED ONCE PER ACCOUNT, and the unique index on
--     (account_id, n) is what makes that true. The private side guards seeding
--     with an in-process promise map, which cannot hold across instances — two
--     concurrent first loads on two containers would both seed. A constraint
--     holds wherever the request lands, so `on conflict do nothing` is the whole
--     mechanism.
--   * A DAILY ITEM IS DONE ONLY FOR THE EASTERN DAY IT WAS CHECKED. While
--     checked, `due_at` holds the next ET midnight; once today reaches it the
--     check clears on its own, with no write needed to display it. That is why
--     the column is shared between "when is this next due" and "how long does
--     this check last" — they are the same question for a repeating task.
--   * `position` ORDERS ITEMS WITHIN A SECTION and is not a database concern
--     beyond ordering: gaps are fine and expected, because removing an item
--     leaves one and restoring puts the item back at the number it held.
--   * EVERYTHING IS THE ACCOUNT'S OWN. Every row carries account_id and every
--     statement filters on it, including the ones that already match a row id.

create table public_todo_sections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  n integer not null,
  icon text not null,
  title text not null,
  -- 'one' is a plain task list, 'note' a bulleted list that is never checked,
  -- 'daily' resets every Eastern day, 'routine' repeats on interval_days.
  type text not null check (type in ('one', 'note', 'daily', 'routine')),
  -- Null for every section a public account starts with; the column exists so a
  -- routine section can say how often it comes round.
  interval_days integer check (interval_days is null or interval_days > 0),
  created_at timestamptz not null default now()
);
create unique index public_todo_sections_account_n_unique on public_todo_sections (account_id, n);

create table public_todo_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public_accounts(id) on delete cascade,
  section_id uuid not null references public_todo_sections(id) on delete cascade,
  text text not null,
  position integer not null default 0,
  -- A dash rather than a checkbox: a reference line inside a task list.
  hyphen boolean not null default false,
  done boolean not null default false,
  due_at timestamptz,
  interval_days integer check (interval_days is null or interval_days > 0),
  created_at timestamptz not null default now()
);
create index public_todo_items_section_idx on public_todo_items (account_id, section_id, position);
