# Strahd Hub — Context

Campaign management app for a Curse of Strahd game. Solo developer.
~5-10 users total (my D&D group). I'm the DM.
Primary goal is learning full-stack development; the working app is secondary.
Not production software — no SLA, no uptime concerns, no team to onboard.

**Current through migration 047. Last updated 2026-08-22.**

## What lives where — read this before editing this file

This document once went eighteen migrations stale because it carried three
things that change every week: a debt list, a "Next" list, and a per-feature
state dump. Those live somewhere else now, and the rule that keeps them out is
mechanical: **if a line here would need editing every time a migration lands, it
belongs elsewhere.**

- **This file** — conventions, architectural decisions and the reasoning behind
  them, and invariants that survive a feature landing. Slow-moving.
- **`KNOWN_ISSUES.md`** — every open issue, every accepted trade-off, and a
  Resolved section. The single source of truth for "what's wrong right now".
  This file does not duplicate it; it points at it.
- **`db/`** — ground truth for schema. Every migration explains itself in a
  header comment. The database, not this document, is what to check when the
  two disagree.
- **`public.schema_migrations`** — ground truth for *what has actually run*.

## How I want help

I write the code. Review and guide me; give complete implementations only
when I'm genuinely stuck. Explain the concept before the code. When I'm
wrong, tell me why it's wrong and how to think about it correctly.
Push back on me. Flag architectural problems proactively.

### Response length

Default to concise. Match length to the idea's actual complexity, not to a
target word count. One tight paragraph beats three padded ones. Cut hedges,
restatements, and preamble ("what I'm about to explain is...") — get to it.
BUT: don't sacrifice correctness or a genuinely needed edge case / why / caveat
to hit a length. If an idea really takes three paragraphs, use three. The test
isn't "is this short" — it's "would removing this sentence lose information."
When in doubt, lead with the answer, then add depth only if it earns its place.

---

## Stack

React 19.2 + Vite + TypeScript, Supabase (Postgres + RLS + auth), HashRouter,
TanStack Query v5. Deployed to Cloudflare Pages (`dnd-cos.pages.dev`); build
config lives in the dashboard, not the repo. Development on Windows/PowerShell.

Types are generated, never hand-written: `npm run gen:types` →
`src/types/database.types.ts`. `Tables<"...">` / `TablesUpdate<"...">`
everywhere; no hand-rolled row interfaces, no `as ItemRow[]` casts except where
a PostgREST embed genuinely defeats inference (see `PARTY_SELECT`).

## Conventions

- `services/` — all Supabase calls, nothing else touches the client
- `hooks/` — custom hooks, one per resource, TanStack Query inside
- `pages/` / `components/` — split by route vs. reusable
- Two-interface pattern (`ItemRow` / `Item`) where DB shape needs transformation
  for the UI. Not used where there's no transformation.
- Migrations live in `db/` as numbered SQL, one file per change, and match the
  live DB. **Every migration gets a header comment explaining why.** A bare
  migration is unfindable and unreviewable later — `035_npc_desc_fix.sql` is the
  cautionary example.
- **Since 036, every migration ends with its own ledger insert, unguarded:**

  ```sql
  begin;
    ... the migration ...
    insert into public.schema_migrations (version) values ('0NN');
  commit;
  ```

  No `on conflict` — that's the point. A re-run fails on the primary key and
  rolls back, and a half-run leaves no entry, so the table never claims a
  migration landed that didn't.
- Verification blocks live in the same file as the migration, below it, and get
  no ledger row. Every block runs in its own transaction and ends in `rollback`,
  so they can be re-run against the live database whenever.
- **A verification block that expects a refusal catches it and reports it as a
  row** (039's shape, taken from 037's BLOCK 3). A block whose documented pass
  condition is "ERROR" is worse than it looks: the SQL editor paints it red and
  stops, so a passing check is indistinguishable at a glance from a broken
  migration, and running the file top to bottom halts on the first success.
- **Run verification blocks one at a time.** The Supabase SQL editor renders
  only the last result set of a run, so pasting a whole section shows the final
  block and silently discards every one before it.

### Query-key convention (TanStack Query v5)

Anything the `queryFn` closes over must appear in the key, or the cache entry
lies about what it holds. `["items", campaignId]`, `["recaps", campaignId]`,
`["characterInventory", characterId]` — no campaign in the last one, because a
character id already implies exactly one campaign.

Destructure the query result, never spread it: v5 subscribes the component to
the fields actually read, and a spread reads every getter — including
`isFetching`, which flips on every background refetch.

Mutations reject rather than surfacing through the query's `error`. `error`
means "the page has nothing to show"; a failed save happens with a full page
behind it and belongs next to the control that caused it. Hence `mutateAsync`
almost everywhere, with the caller's own try/catch.

## Gotchas — things that look like bugs and aren't

**`SubmitEvent` is correct here.** `import { SubmitEvent } from "react"` with
`SubmitEvent<HTMLFormElement>` on form handlers. @types/react v19 exports a
generic `React.SubmitEvent<T>` (the DOM global is aliased to
`NativeSubmitEvent`) and deprecates `FormEvent`; the repo is on react 19.2 /
@types/react 19.2 and `tsc --noEmit` passes. Do NOT "fix" this to `FormEvent` —
that's stale pre-v19 knowledge.

**Upsert conflict behaviour is per-table and load-bearing in both directions.**
There are two shapes in this codebase and they are not interchangeable:

- `character_spells` (037) and `character_feats` (041) upsert with
  `ignoreDuplicates: true`. supabase-js renders that as
  `Prefer: resolution=ignore-duplicates` → `ON CONFLICT DO NOTHING`, which needs
  only INSERT — and neither migration ships an UPDATE policy, deliberately.
  Flip it to `false` and PostgREST emits `ON CONFLICT DO UPDATE`; the first add
  still succeeds and the *duplicate* add starts throwing 42501.
- `campaign_map_reveals` (042) upserts **without** `ignoreDuplicates`, because a
  re-toggle must actually change the stored value. That is exactly why 042 ships
  the UPDATE policy the other two omit.

Both failures wear the same costume: works once, refuses mid-session. 033 wrote
a verification block for it on `npc_dm_notes`; 042's BLOCK 5 is the same block
pointed at the opposite mistake.

**The pin triggers are blocklists.** `pin_npc_row`, `pin_character_row` and
`stamp_session_recap` name the columns an update may *not* touch, so every
column added to those tables from here on is client-writable until someone
remembers to pin it. It fails open. Check the trigger before adding a column.
(See KNOWN_ISSUES for the allowlist inversion, if it's ever worth doing.)

**A pin trigger also blocks *your* migration.** `pin_npc_row` silently no-ops a
direct `UPDATE` to a pinned column even when you're the table owner, so a
migration that sets one needs `ALTER TABLE ... DISABLE TRIGGER` scoped inside
its own `begin`/`commit`. The update otherwise reports success and changes
nothing.

**A refused write raises nothing.** RLS `USING` excludes rows before `WITH
CHECK` is consulted, so a forbidden UPDATE or DELETE comes back as a clean
zero-row 200. Services that care use `.select().maybeSingle()` and treat "no row
came back" as a refusal (`updateNpc`, `deleteCharacter`, `deleteRecap`,
`updateMapReveal`). Services that don't care say so in a comment.

**`PGRST202` means "not in the schema cache", not "does not exist."** Run
`notify pgrst, 'reload schema';` and check `pg_proc` before touching a migration
file. The 2026-08-13 episode — three inventory RPCs read as "030 and 032 never
ran" — was this, or might have been; the ledger exists so the question is now
answerable. A missing *grant* reads as 401/42501 instead.

---

## Decisions & rationale

### Profiles / auth

- **Profile creation is on-demand, not a DB trigger.** The common Supabase
  pattern is a trigger on `auth.users` insert that writes a `profiles` row.
  Rejected because that logic lives in the auth schema — invisible from the
  app codebase, unversioned alongside the rest of the project, running with
  elevated privilege out of sight. On-demand creation (`getOrCreateProfile`)
  keeps it in the services layer where it's visible, versioned, and readable
  next to everything else. The cost — a race when two calls both see "no
  profile" — is handled explicitly (below) rather than hidden in a trigger.

- **All profile mutations go through security-definer functions; no general
  UPDATE policy on `profiles`.** A general UPDATE policy that lets a user edit
  their own row would also let them edit their own `role` — i.e. self-promote
  to `dm`. RLS can't easily say "you may change display_name but not role" on a
  blanket policy. So `profiles` has SELECT + INSERT policies and NO UPDATE
  policy at all; every mutation routes through a security-definer function that
  controls exactly which columns change and under what conditions:
  `set_display_name` touches only display_name (with trim/length validation),
  and `claim_dm_invite` sets role='dm' only after atomically consuming a valid
  invite. The database enforces the allowed changes instead of trusting the
  client to send only safe ones.

- **Race handling uses `upsert` + `ignoreDuplicates`, not catch-and-retry.**
  Two concurrent calls (two tabs, or onAuthStateChange firing twice) can both
  see "no existing profile" and both attempt an insert. Catch-and-retry would
  mean insert → catch the unique-violation → refetch, which couples the code to
  a specific Postgres error shape and mixes error handling into control flow.
  `upsert(..., { ignoreDuplicates: true })` makes the losing insert a silent
  no-op (returns no row); the code then refetches the winner's row. Declarative
  "insert if absent, else do nothing" — an expected race handled as normal flow.
  Same pattern reused in `addSpellToCharacter` and `addFeatToCharacter`.

### Routing

- **HashRouter over BrowserRouter.** Static-hosted SPA. With BrowserRouter, a
  hard refresh or direct hit on a sub-path like `/Maps` sends `GET /Maps` to the
  host, which has no such file and 404s — unless you add a catch-all rewrite.
  HashRouter puts the route in the URL fragment (`/#/Maps`); the fragment is
  never sent to the server, so every request resolves to `index.html`. Refresh
  and deep-links work with zero host config (which is why there's no
  `_redirects` in the repo). Cost accepted knowingly: `#` in every URL, and
  quirky query-string handling under the hash (`useSearchParams` reads the
  post-`#` string) — watched for when `/claim?code=...` got built, and it
  worked out.

- **Routes are flat above the campaign line, nested below it.** `/`
  (CampaignPicker), `/claim`, and `/invites` (DM invites) are all things you do
  *before* you have a campaign, so none can sit under `:campaignId`. Everything
  campaign-scoped lives under `/campaign/:campaignId`, gated by `CampaignLayout`,
  which validates the param against the user's own campaign list and — like
  AuthGate — renders nothing below until there's a real campaign, then puts it
  on the outlet via `useCampaign()`. So a page under that route takes its
  campaign as a given instead of re-deriving it and handling null. Player
  invites are the one exception below the line
  (`/campaign/:campaignId/Invites`), because `generate_player_invite` takes the
  campaign as an argument and the URL is where that comes from.

### Reveal gating

- **Reveal gating is an RLS boundary, not a client filter.** Sending a full row
  and hiding it with CSS or `.filter()` doesn't protect anything — the row is
  already on the client; anyone can read it in the network tab. Enforce
  visibility in RLS so unauthorized rows never leave the database. Keep DM-only
  fields in a SEPARATE DM-only table (`location_dm_notes`, `npc_dm_notes`),
  never a nullable column on the base table, so they can't leak through the base
  table's SELECT policy.

  Both Maps and NPC follow this: neither page has a reveal filter, because RLS
  already dropped the hidden rows. `isDm` survives only to style the hidden pins
  a DM still receives, and to show the DM-only editors.

- **Hiding the row and hiding the thing are only the same when absence means
  hidden.** 018 gives `locations` a two-branch read
  (`is_campaign_dm(...) or (is_revealed and is_campaign_member(...))`), and
  copying that shape onto `campaign_map_reveals` (042) would be an inversion
  bug. On locations, an unrevealed row simply isn't in a player's response,
  which is correct. On map reveals, the client falls back to the registry's
  `defaultRevealed` when no row comes back (`mergeReveals` in `useMaps.ts`), so
  an `is_revealed`-gated read would take the DM's `is_revealed = false` row away
  from exactly the player it was written to affect. That table asks plain
  membership, on purpose.

  **The general rule: before copying a reveal policy, ask what the client does
  when the row is missing.** If absence falls back to a default, gating the read
  on the flag inverts it.

### Multi-campaign (010–020)

- **`campaign_id` means two different things by table, and that split is the
  design.** `items.campaign_id`, `spells.campaign_id` and `feats.campaign_id`
  are NULLABLE: null = shared SRD/PHB catalogue that reaches every campaign,
  non-null = one campaign's homebrew. `locations`, `session_recaps`, `npcs` and
  `party_inventory` are content that means nothing outside their campaign, so
  theirs is NOT NULL. Reads reflect this. Scoping items the way the others are
  scoped would hide the whole shop from every player, which is the
  over-correction to avoid.

- **Sibling tables deliberately have no `campaign_id`.** `location_dm_notes`,
  `npc_dm_notes`, `character_inventory`, `character_spells` and
  `character_feats` are one row per parent, keyed by the id they reference, so
  the campaign is one join away. A second copy could only ever disagree with the
  first, and `on delete cascade` means the child can't outlive the parent
  anyway. Their RLS reaches the campaign through an EXISTS join that **fails
  closed**: the subquery runs as the invoking user, so it answers through the
  parent's own SELECT policy — a caller who can't see the parent gets a false
  EXISTS and the child is unreachable, whatever the inner check would have said.

  In those joins, always write the referencing column out in full
  (`npc_dm_notes.npc_id`, not bare `npc_id`). Bare, it resolves to the outer
  relation only because the parent has no column of that name — correct by
  accident, and silently wrong the day it gains one.

- **`is_dm()` (global `profiles.role`) means exactly one thing: "may create
  campaigns."** As of 018/019 no content or invite policy asks it. It survives
  in four legit places: `create_campaign` + "dm inserts campaigns" (no campaign
  exists yet to be DM *of*), `claim_dm_invite` (what sets the flag), and "dms can
  view invites" on `dm_invites` (a DM invite grants the flag, so the flag gates
  it — the one place `is_dm()` correctly guards `is_dm()`). Everything else asks
  the per-campaign `is_campaign_dm`.

- **`security invoker` is the default; `security definer` needs a reason.**
  The reason is normally a recursion break, and a definer function carries a
  `revoke execute ... from public, anon` — with RLS bypassed the EXECUTE grant
  is the only remaining gate. Invoker functions (`is_campaign_member`,
  `can_edit_character`, and both 038 transfer RPCs) skip the revoke because an
  anonymous caller just gets `false` out of reads RLS already governs.
  *(⚠ This paragraph was partly reconstructed — check it against 013/014/018
  before trusting the detail on which helpers are definer vs invoker.)*

- **Recaps: uniqueness is on `(campaign_id, session_number)`.** The old
  global-unique constraint meant the second campaign could never have a Session
  1. The `stamp_session_recap` BEFORE-UPDATE trigger pins the immutable facts
  (`id`, `session_number`, `created_at`, `campaign_id`) and sets
  `last_edited_by/at` from the JWT — because RLS can't restrict columns, that
  trigger is what keeps "any member may edit" from meaning "may rewrite
  anything," and pinning `campaign_id` is what stops a two-campaign member
  dragging a recap between their campaigns.

- **Invites: player invites are campaign-scoped, DM invites are global, and both
  write only through security-definer RPCs.** Both invite tables have a SELECT
  policy and nothing else. Minting (`generate_player_invite` gated by
  `is_campaign_dm`; `generate_dm_invite` gated by the global flag) and burning
  (`claim_player_invite`, `claim_dm_invite`) are all security-definer and write
  past RLS, each carrying its own gate in code. Claiming works even though the
  claimer can't read the row they're burning — an invitee is by definition not
  yet a member of anything. NOTE: `claimDmInvite` changes `profiles.role`, which
  AuthContext caches; callers must follow it with `refetchProfile()` —
  `useClaimDmInvite` pairs the two so you can't forget.

- **Client scopes by `campaignId` even though RLS already gates.** `getRecaps`,
  `getLocations`, `getNpcs`, `getInvites`, `getItems`, `getSpells`, `getFeats`
  and `getMapReveals` all filter by campaign. This is NOT a duplicated
  permission check — RLS answers "may this viewer see this row," and a member of
  two campaigns passes it for *both*, so an unfiltered read merges two campaigns
  onto one page. The filter narrows "every campaign I'm in" down to "the one I'm
  looking at." (Contrast `getCampaigns`, where the policy *is* the list, and
  restating it in the client would just add a second place to get it wrong.)

  For `items`/`spells`/`feats` the filter is `campaign_id is null or campaign_id
  = <the viewed campaign>`, which keeps the shared catalogue and drops the other
  campaign's homebrew.

### Characters, inventory, spells and feats (028–032, 037–038, 041)

- **The identity row is the owner's alone; the sheet's contents are shared with
  the DM.** `characters` UPDATE and DELETE are `user_id = auth.uid()` — the DM
  cannot rename or delete a player's PC. `character_inventory`,
  `character_spells` and `character_feats` use `can_edit_character(character_id)`,
  which 028 defines as "the owner OR this campaign's DM", so the DM can hand out
  loot, grant spells and add feats mid-session. That is the one new line these
  migrations draw, and `can_edit_character` is deliberately never used on
  `characters`' own policies.

- **`characters` uses a composite FK to `campaign_members`, not two FKs.** This
  makes "a character for a non-member" unrepresentable, and the cascade means
  leaving a campaign takes your character and its loot with you. Same shape as
  `npcs`' composite FK to `locations (campaign_id, id)`, which makes "an NPC of
  campaign A standing in a location of campaign B" unrepresentable. Note the
  column list on `on delete set null (location_id)` there — it is not optional,
  and it needs Postgres 15+.

- **Quantity changes are atomic in the database, not the client.** 030 and 031
  made adds insert-or-increment; 032 moved decrement into a plpgsql function
  taking a `SELECT ... FOR UPDATE` lock, because the branch "decrement, but
  DELETE at the last one" can't be one statement (`quantity > 0` CHECK means 0
  isn't a storable state) and the lock-free version loses a concurrent *add*.
  Both are `security invoker`, so RLS remains the boundary. There is no
  read-modify-write left in the app.

- **Transfers are one transaction across two tables (038).**
  `move_party_item_to_character` and `move_character_item_to_party` are the only
  writes in this app that span two tables, so they are the only place where a
  half-completed operation could duplicate or destroy a stack. Both are
  `security invoker` — a `prosecdef = true` on either means RLS has been
  switched off for exactly the write that most needs it, which is what 038's
  BLOCK 0 checks. The stack must leave the source and arrive at the destination,
  or do neither.

- **`character_spells` and `character_feats` are the simple twins, and every
  absence is a decision.** No quantity (a spell or feat is on the list or it
  isn't), no `added_by` on either (nobody will ask who typed it — contrast
  `character_inventory`, where DM-granted and player-bought loot are genuinely
  different things), no UPDATE policy (every column is a key or a defaulted
  timestamp — nothing an update could change that delete-and-insert doesn't
  express better). The unique `(character_id, x_id)` doubles as the conflict
  target for the client's upsert and as the only index the table needs. **A
  fourth policy on either table is a bug**, and both verification files check
  the policy count for exactly that reason.

- **The Party page is not DM-only to read.** Every SELECT policy involved
  (`characters`, `character_inventory`, `character_spells`, `character_feats`)
  is campaign membership, so the whole page is what any player may already see.
  The Give and Teach controls are gated on `isDm` for honesty about whose
  controls they are; RLS is the enforcement.

### Catalogue tables: feats (039–041)

- **`feats` is 022's spells table with a different set of columns**, and the
  differences are all downstream of one fact: a feat has no level. `category`
  takes the ordering/grouping/filtering job a spell's level does, and its six
  values live in a CHECK constraint rather than a lookup table because the set
  is small, closed, and changing it *should* be a migration someone has to
  write. `benefits` is `text[]` defaulted to `'{}'` so the detail card renders a
  `<ul>` without branching on null.

- **`prerequisite` and `repeatable` are DISPLAY ONLY, and that is structural,
  not lazy.** Nothing in this database can enforce "Strength 13 or higher" —
  028's `characters` stores a name and nothing else: no level, no class, no
  ability scores. And 041's unique `(character_id, feat_id)` caps every feat at
  one per sheet, so `repeatable` tells a reader that Elemental Adept may be
  taken again without the app being able to record it. Making either real is a
  much larger change than it looks.

- **039 ships its INSERT policy in the same migration as the table**, unlike
  022/025 where homebrew was retrofitted. DM homebrew was part of the feature
  this time, so there's no window where the table is read-only by accident. The
  `campaign_id is not null` clause is what stops any client path from writing a
  new *shared* catalogue row — only 040 does that, and only because it runs as
  the table owner outside RLS.

- **The known consequence: a cross-campaign feat can be attached by hand, and
  that's left open on purpose.** Because 039 ships an INSERT policy (022 did
  not), a DM in two campaigns can create homebrew in B and attach it to a
  character in A, where nobody else can read it. 041's BLOCK 6 demonstrates it
  rather than asserting it away. Closing it needs either a composite FK (which
  feats can't have — shared rows have a null `campaign_id` and would match
  nothing) or a trigger re-deriving the character's campaign on every insert,
  and the exposure is one DM mislabelling their own table. The client never
  offers it: the picker is fed by `getFeats(campaignId)`.

### Maps (042)

- **Map definitions live in code; only reveal state lives in the database.**
  Adding a map always means committing an image file, so it's a code change
  regardless — a `maps` table would buy no deploy-free flexibility. What
  genuinely varies per campaign is which maps have been revealed, so that alone
  gets a table (`campaign_map_reveals`). `src/data/maps.ts` is the registry.

- **Absence of a row means "use the registry default."** That's why the table
  has no default on `is_revealed`: a defaulted row would be a second way to say
  the same thing, and the two can disagree the moment the registry default
  changes. It's also why the read policy is plain membership (see Reveal gating
  above) and why `updateMapReveal` must not use `ignoreDuplicates` (see
  Gotchas).

- **`map_key` has no FK or enum, and the registry decision is the reason.**
  The constraint would have to name the code-side registry, which SQL can't
  reach. A hand-written seed can still typo a key; the mitigation is the
  coordinate-finder in `MapView` logging the exact key, not a list in the
  schema.

- **⚠ This is the first reveal-gated feature where RLS is not the boundary.**
  `campaign_map_reveals` is real, protected data — but what it gates is a plain
  module in the JS bundle every authenticated user downloads. `MapView.tsx`'s
  `mapsAsPlayer` flag is a client-side `if`. This is a known, written-down
  exception to the reveal-gating principle above, not a pattern to copy. See
  `KNOWN_ISSUES.md`.

### Currency (045)

- **A character's purse is owner-only; the party's pool is every member's,
  DM included.** This is 028's split again, applied to money instead of gear:
  `characters`' own UPDATE policy is owner-only, and 045 adds five columns to
  that table rather than widening it or routing purse changes through
  `can_edit_character` — so, deliberately, there is no DM path onto a
  character's own coin, unlike `character_inventory`. `party_currency` is the
  opposite: one row per campaign, gated by `is_campaign_member` for both read
  and write, the same policy `party_inventory` already uses for all four of
  its operations. So "the DM can add to the party's pool" is not a special
  case anywhere — the DM is a member, and members already can.

- **Full denominations, stored as five separate integer columns, not one
  converted total.** `items.price_cp` stores a price as all-copper because a
  price is one number with one meaning; a purse is physical coins of five
  different kinds, and collapsing them would lose which coins someone is
  actually holding. No auto-conversion between denominations — see
  `KNOWN_ISSUES.md`.

- **Adjustment is one `UPDATE ... WHERE col + delta >= 0` statement, with no
  `SELECT ... FOR UPDATE` lock**, unlike 032's decrement functions. Those lock
  because "decrement, but DELETE at the last one" is a branch — `quantity` has
  a `> 0` CHECK, so 0 isn't storable, and the lock is what stops a concurrent
  add from landing in the window between the failed decrement and the delete.
  A purse has no such branch: it can sit at exactly 0 forever, so the single
  statement is already atomic on its own, and `delta`'s sign (positive to add,
  negative to spend) is what lets one function and one policy serve both
  directions. `adjust_character_currency` and `adjust_party_currency` are
  `security invoker`, so RLS — not the function — is still what decides who
  may call this on which row.

### Player-authored descriptions (046–047)

- **The override is keyed to the character's idea of the thing, not to the row
  that says they have it.** `character_spell_descriptions` and
  `character_item_descriptions` key on `(character_id, spell_id)` /
  `(character_id, item_id)`, not on the `character_spells` /
  `character_inventory` row. A column on the join row would have been one
  cheaper request, and it is the wrong answer, because those rows are
  disposable: 032's decrement DELETEs the stack at the last one (`quantity > 0`
  makes 0 unstorable) and 038's transfers delete the source row on every Stow.
  Flavour living there would evaporate on a stow-and-take, which is the most
  ordinary thing anyone does on the Inventory page. 047's BLOCK 4 destroys the
  stack three ways and shows the text still standing, rather than asserting it.

  The cost is accepted and written down in `KNOWN_ISSUES.md`: give an item away
  for good and the row lingers, invisible, until you own that item again.

- **Four policies here, where 037 insists on three, and that is not drift.**
  037 has no UPDATE policy because `character_spells` has nothing an update
  could change. These tables are nothing *but* a mutable column, and the client
  saves through an upsert whose second save is an UPDATE — so three policies
  here is the bug, in exact mirror image. Both migrations say so in their
  headers, and both BLOCK 0s assert four. Note the matching inversion in the
  client: `ignoreDuplicates` is load-bearing by its *presence* on
  `addSpellToCharacter` and by its *absence* on `saveCharacterSpellDescription`.

- **They also ship a DELETE policy, which `npc_dm_notes` and
  `location_dm_notes` deliberately refuse.** Those tables clear with
  `notes = ''` because a blank note and a missing note render identically. Here
  they do not: an absent row resolves to the catalogue text, so a blank one
  would have to resolve the same way, and `''` becomes a second spelling of
  absent — 042's argument against a defaulted row. A CHECK makes a row that
  overrides nothing unrepresentable, and the service turns a blank draft into a
  delete at the boundary so the constraint is never what a player sees.

- **The pin trigger is the one 028 declined to write.** 028 left
  `character_inventory.character_id` unpinned on the grounds that "moving an
  entry between two characters you can edit is harmless" — true of a stack of
  arrows, false of somebody's prose, and a DM's `can_edit_character` passes on
  every sheet in the campaign. Both tables pin both key columns and stamp
  `updated_at`, `stamp_session_recap`'s shape.

- **Two reads, because PostgREST cannot embed across an FK that isn't there** —
  the same fact as the first bullet, seen from the client. `getCharacterSpells`
  and `getCharacterInventory` fire both in `Promise.all` and denormalise the
  result onto the entry, the way `addedBy` already becomes `addedByName`. A
  failure in either sinks both on purpose: the one case where they diverge is
  the table missing from the schema cache, which must not be swallowed into
  "this character has written nothing".

- **The catalogue name is never hidden, only demoted.** Lists, pickers, sorting
  and `spellsByLevel` all still work off it, and the row prints it beside the
  custom one; `useSearchBar` matches on either. Hiding it would order the sheet
  by something invisible and take the rules' own word away from the DM reading
  over a player's shoulder.

- **047 also un-anchored `ItemDetailCard` from its position in the tree.** That
  card was styled by `.shop > div:nth-of-type(2) > div`, so it had no frame
  anywhere but the Shop — the hoard rail had been rendering it bare since
  Inventory stopped borrowing `shop.css`, with the absolutely-positioned × in
  the corner of the viewport. Its rules are class-keyed on `--sh-*` tokens now,
  the way `.spell-detail-card` always was, which is what let the pack have a
  card at all.

---

## Open issues, debt, and what's next

**See `KNOWN_ISSUES.md`.** Do not duplicate any of it here — that's how these
two files drifted apart the first time.
