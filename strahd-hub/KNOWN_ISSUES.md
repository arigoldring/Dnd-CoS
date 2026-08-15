# Known issues

Things that are wrong on purpose — understood, judged not worth fixing at this
size, and written down so they stay decisions rather than becoming discoveries.
Each entry says what it takes to trigger, what it costs, and what the fix would
be if the answer ever changes.

---

## Open

### Nothing records which migrations have been applied (noted 2026-08-14)

`db/` is declared ground truth, but the database holds no record of which files
in it have actually run. The two are compared only by accident — by someone
regenerating `database.types.ts` and noticing the diff, or by a feature failing
in front of a player.

**Trigger:** any migration that is written, committed, and not run. On the
Supabase SQL editor there is no `\i`, no transcript and nothing that fails on a
half-pasted file, so a migration can be believed applied on no evidence at all.

**Cost:** silent divergence between the repo and the schema, discovered late and
by the worst available route. The 2026-08-13 episode is the illustration: three
inventory RPCs came back `PGRST202` and were read as "030 and 032 never ran".
Re-running them fixed it — which is also what a stale PostgREST schema cache
would have looked like, since `create or replace function` emits a DDL event and
forces a reload. **Which of the two it actually was is still unconfirmed**; the
check is `select proname from pg_proc where proname like '%inventory_item'`,
against the catalog, which does not care what PostgREST believes. The point is
not which diagnosis was right. It is that the question could not be answered
from anything the database stores.

**Fix if the answer changes:** a ledger, and it is small.

```sql
create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);
```

Every migration ends with `insert into schema_migrations values ('033');`
inside its own transaction, so a half-run leaves no entry and a re-run fails on
the primary key instead of quietly re-applying. Backfill 001–034 by hand once.
After that, "did 032 land" is a select rather than an inference.

Worth knowing regardless: `PGRST202` means _not found in the schema cache_, not
_does not exist_. `notify pgrst, 'reload schema';` is the cheap first thing to
try, and `pg_proc` is the thing to check before touching a migration file.

### The pin triggers are blocklists, so new columns are writable by default (noted 2026-08-14)

`pin_npc_row`, `pin_character_row` and `stamp_session_recap` all name the columns
an update may _not_ touch. Every column added to those tables from here on is
client-writable until someone remembers to pin it.

**Trigger:** adding a column. `npcs.faction_id`, a `characters.level`, anything.
The failure is invisible at the moment it is introduced — the migration adding
the column succeeds, the app works, and the column is simply open.

**Cost:** depends entirely on the column. Harmless for a display field, a
privilege hole for anything the DM is supposed to control. It fails open, which
is the wrong direction, and the comment at each trigger saying so only helps
someone who reads the trigger — and the reason they are editing is that they are
thinking about the column, not about the trigger.

**Fix if the answer changes:** invert to an allowlist. Start from `old` and copy
across only the writable set, so an unlisted column is read-only rather than
open:

```sql
declare r npcs := old;
begin
  r.name        := trim(new.name);
  r.description := new.description;
  r.location_id := new.location_id;
  r.is_revealed := new.is_revealed;
  return r;
end;
```

Identical behaviour today. This is a convention change rather than one table's
fix — do all three together or none, so the pattern stays legible.

### `npcs.description` is normalised in the client only (noted 2026-08-14)

`name` is trimmed by `pin_npc_row` and backstopped by `npcs_name_check`, so the
database is where that rule lives. `description` is normalised by
`blankDescriptionToNull` in `services/npcs.ts` and by nothing in Postgres — two
adjacent fields, two different layers, for no stated reason.

**Trigger:** anything writing a description without going through `updateNpc`.
Today that means the seed and anything typed into the SQL editor, which is also
exactly where the roster comes from. A description of `'   '` stored that way
renders as an empty paragraph, because `npc.description ?? "No description yet"`
treats `''` as present.

**Cost:** cosmetic. One card with a blank space where its blurb should be, and no
sign anything went wrong.

**Fix if the answer changes:** mirror what `name` already does — normalise in the
trigger, backstop with a constraint.

```sql
-- in pin_npc_row, beside the name trim
new.description := nullif(btrim(new.description), '');

alter table npcs add constraint npcs_description_check
  check (description is null or (description = trim(description) and description <> ''));
```

Block 9 of the verification confirms this constraint is **not** currently
present. Order matters if it is ever added: clean existing rows first, or the
constraint will not validate.

```sql
update npcs set description = null
where description is not null and trim(description) = '';
```

**That cleanup has not been run.** Whether any stale `''` rows exist is unknown —
no app path has ever written one (`NpcEditor` converted blank to `null` from its
first commit, and `updateNpcDescription` was born unused), so any that exist came
in through the console.

### NPCs cannot be created or deleted from the app (noted 2026-08-14)

`npcs` has SELECT and UPDATE policies and deliberately no INSERT and no DELETE.
The roster arrives through the SQL editor, which is also where portraits and
seeded notes are prepared.

**Trigger:** wanting a new NPC mid-session. There is no button, and adding one is
a migration.

**Cost:** the DM leaves the app to add a row. Acceptable while the roster is
prepared between sessions, annoying the first time a player names an innkeeper
that needs to exist immediately.

**Fix if the answer changes:** an INSERT policy gated on `is_campaign_dm`, a
`with check` that pins `campaign_id` to a campaign the caller runs, and a
decision about `portrait_key` — which is currently pinned against updates
precisely because a key naming no file fails silently. This is a piece of work,
not a policy line. **The absence is the design; do not add either policy for
symmetry.**

### No portraits exist (noted 2026-08-14)

`src/assets/portraits/` is not in the repo, so `PORTRAITS` resolves to an empty
object and every card renders without an image. Vite handles the empty glob
without complaint; the build confirms it. Git cannot track an empty directory, so
the folder appears with the first file.

**Fix:** two steps in this order — drop `<uuid>.webp` into
`src/assets/portraits/`, then a one-line migration setting that NPC's
`portrait_key` to the same uuid. Doing it the other way round produces a key
naming no file, which is exactly the silent failure the pinning exists to
prevent.

Related: `public/portraits/strahd.png` is the old hardcoded path and nothing
references it. Delete it — an unreferenced file at a path that used to be
load-bearing is what future-you greps for and gets misled by.

### `truncate locations cascade` now empties `npcs` (noted 2026-08-14)

`npcs` carries a composite FK to `locations`, and `TRUNCATE CASCADE` follows
every foreign key pointing at a table regardless of what that key's `ON DELETE`
action says. The FK's `on delete set null (location_id)` protects a single-row
delete and does nothing here.

**Trigger:** reseeding the map. This project has done it before.

**Cost:** the entire NPC roster, silently, as a side effect of a statement about
locations.

**Fix:** `delete from locations where ...` instead of `truncate`, or reseed the
roster after. Flagged at the bottom of `033_npcs.sql` as well as here.

### Removing a player from a campaign destroys their character and all its gear (noted 2026-08-12)

`characters` carries a composite FK to `campaign_members (campaign_id, user_id)`
with `on delete cascade`, and `character_inventory.character_id` cascades from
`characters` in turn. So deleting one `campaign_members` row silently deletes
that player's PC and every item on it, in the same statement, with no
intermediate state and nothing to restore from.

**Trigger:** any delete against `campaign_members`. There is no kick UI today —
the only paths are leaving a campaign yourself and a manual delete in the
Supabase console — so this is latent rather than live. It is written down now
because the day a "remove player" button is built, the cascade is already wired
and does not appear anywhere near the button that fires it. A DM demoting a
player who missed a session would not expect to be deleting their character
sheet, and the UI would give no sign that they had.

**Cost:** unrecoverable loss of one PC and its inventory. Cheap at this size
(a character is a name plus a gear list, and reset already exists as a
deliberate version of the same destruction), expensive in surprise, because
nothing in the action's wording implies it.

**Fix if the answer changes:** the cascade itself is right — 028 chose it so
that leaving a campaign takes your character with you rather than stranding a
row that fails its own FK. What is missing is at the call site, not in the
schema: any kick UI needs to name the consequence in its confirm, the way the
reset form already does ("Resetting deletes {name} and everything they carry"),
and should read the character first so it can name it. If characters ever need
to outlive membership, that is a different change — `on delete cascade` becomes
a nullable `campaign_members` link plus a retirement flag, which 028 explicitly
declined ("there is no retired_at, by decision").

### `removeFromPartyInventory` assumes party gear is common property

Any campaign member may remove any row from the party inventory. That is the
intended model — the party stash belongs to the party — and it matches how
recaps are editable by everyone.

**Fix if the answer changes:** if the DM ever needs sole control of removals, or
if `added_by` is ever meant to confer ownership, the DELETE policy is where that
split goes, not the service. `added_by` is already stamped server-side from
`auth.uid()` in a trigger, so the column is trustworthy enough to gate on.

---

## Minor

Small, understood, not worth an entry of their own.

- **`useNpcs` has no `staleTime`.** Defaults to 0, so every mount and every
  window focus refetches. The three mutations invalidate explicitly, so
  freshness does not depend on it. Pick a number (30s–5min) and comment why.
- **`formatPrice` deferred.** Prices are integer copper and display as
  `price_cp / 100`, so sub-gold items render as "0.01 gold". More visible since
  the general-item seed added many sub-gold entries.
- **Dead campaign uuid in old migrations.** `00000000-…-0001` references a
  campaign that does not exist in this database. It misled the NPC seed work
  once already.
- **Double `console.error` on a failed NPC save.** `updateNpc` logs the Supabase
  error and `NpcEditor`'s catch logs again. One failure, two entries.
- **A player attempting `update npc_dm_notes` is untested.** Covered by
  inspection rather than execution: block 9 of the verification shows its USING
  and WITH CHECK are the same `is_campaign_dm` expression that block 8 proves
  refuses a player on INSERT.
- **Comment cleanup backlog.** AI-assisted sessions left comments that narrate
  edit history rather than explaining current code. A read-only automated pass
  with manual review before commit is the plan.

---

## Resolved

### A blank NPC description could reach the database from a second caller (resolved 2026-08-14)

`updateNpcDescription` normalised blank-to-`null`; `updateNpc` — the function the
editor actually calls — did not. The rule was written down in exactly one place
and enforced on a path nothing used.

Never a live bug: `NpcEditor` converted blank to `null` locally from its first
commit, and `git log -S` shows `updateNpcDescription` was never called by
anything. It was correct-today code that would have stopped being correct at the
second caller — which was going to be NPC creation.

Fixed by moving normalisation into `updateNpc` as `blankDescriptionToNull` and
deleting the per-field function. Guarded on `=== undefined` rather than on
falsiness, which is load-bearing: `toggleVisibility` sends `{ is_revealed }`
alone, and a falsiness check there would have blanked the description on every
eye click.

### The write half of the NPC reveal boundary was untested (resolved 2026-08-14)

`033_npcs_verification.sql` tested SELECT from four angles and no writes from an
unauthorised role at all, leaving the two policies with the most consequence
proven only by reading them.

Two blocks added. Block 7: a player sends an unscoped `update npcs set
is_revealed = true` — expect no error, since USING excludes every row before
WITH CHECK is consulted, so the proof is `rows_changed = 0` against an
owner-taken baseline in a temp table, plus `hidden_before` to show there was
something to steal. Block 8: a player attempts an INSERT into `npc_dm_notes`
naming a _revealed_ NPC, the case where they clear the outer half of the EXISTS
join and only `is_campaign_dm` stops them. The target is resolved as the player
before the attempt and travels in by uuid — a null `npc_id` fails the same EXISTS
with the same 42501, so without that the block would pass identically whether or
not the interesting gate was ever reached.

### Cross-campaign homebrew visible in every campaign's catalogue (resolved 2026-08-12)

`getItems`/`getSpells` selected with no campaign filter and cached under bare
`["items"]`/`["spells"]` keys, on the theory that RLS scoped the result. RLS
answers "may this viewer see this row" — a member of two campaigns passes that
check for both campaigns' homebrew, so both would appear in either campaign's
Shop/Grimoire. Latent until 025 added the items INSERT policy (nothing could
create homebrew before that; spells still can't). Verified against the live DB
by impersonating a dual-member under RLS in a rolled-back transaction: the
unfiltered select returned both campaigns' probe items. Fixed by scoping both
services to `campaign_id is null or campaign_id = <viewed campaign>` and keying
the caches by campaign — the filter is scoping, not a second permission check;
RLS remains the boundary.

### Same-campaign duplicate invite after a double navigation (noted 2026-08-02, resolved 2026-08-11)

`addInvite` in `useInvites` used to prepend the minted row into local state,
guarded by a `shownCampaignId` ref against cross-campaign paints; a
same-campaign reload landing between the mint's two round trips could briefly
duplicate the row. The react-query conversion removed the local prepend
entirely — a mint now invalidates the `["invites", campaignId]` cache entry and
the list is always exactly what the server returned, so neither the duplicate
nor the cross-campaign paint can occur.
