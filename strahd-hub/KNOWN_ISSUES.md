# Known issues

Things that are wrong on purpose — understood, judged not worth fixing at this
size, and written down so they stay decisions rather than becoming discoveries.
Each entry says what it takes to trigger, what it costs, and what the fix would
be if the answer ever changes.

**Current through migration 047. Last updated 2026-08-22.**

This is the single source of truth for open work. `CONTEXT.md` holds decisions
and invariants and deliberately does not duplicate anything below.

---

## Open

### Currency denominations don't auto-convert (noted 2026-08-20)

045 gives a purse five separate integer columns — copper, silver, electrum,
gold, platinum — and `adjust_character_currency`/`adjust_party_currency` each
touch exactly one. There is no "break a gold piece into 10 silver" operation
anywhere: spending 100 cp when a purse holds only gold pieces means manually
adding copper (or converting by hand) before the spend can succeed, because
the copper column's own floor check refuses to go negative even though the
purse's total value would cover it.

**Trigger:** any spend that mismatches the denomination actually held. Common
at the table — loot rarely arrives in the exact coins a price is written in.

**Cost:** low and mostly friction, not data loss — the refusal is a clean
"not enough of that denomination", not a crash, and nothing stops a player or
the DM from doing the conversion by hand with two Add/Spend calls. What it
costs is convenience: nothing in the app currently prices anything to spend
*against*, so it hasn't bitten yet, but it will the day a shop or a service
charge is priced in gold and a party is holding platinum.

**Fix if the answer changes:** a `convert_currency` RPC taking a purse target,
a source denomination, an amount, and a target denomination, doing the spend
and the add as one transaction at fixed 5e rates (1 sp = 10 cp, 1 ep = 5 sp,
1 gp = 2 ep, 1 pp = 10 gp). Not hard, just not written yet.

### `locations` has no `campaign_id`-pinning trigger (noted 2026-08-12)

`session_recaps`, `characters` and `npcs` all carry a BEFORE-UPDATE trigger that
pins `campaign_id` to its old value. `locations` does not. Both clauses of "dms
update locations" pass for a DM who runs two campaigns, so that DM can move a
location from one campaign into the other with an ordinary update.

**Trigger:** being the DM of two campaigns and sending an update that names
`campaign_id`. Nothing in the UI does this — `updateLocationDescription` and
`updateLocationVisibility` send one column each — so it needs a hand-written
request or a client bug.

**Cost:** low, and this is not a privilege hole. Only a DM of _both_ campaigns
can do it, and reassigning a location is a DM action either way; a
single-campaign DM still cannot move a location out. What it costs is
consistency — this is the one content table where the "pin the immutable facts"
rule isn't enforced, and the exception is invisible until someone goes looking.

**Fix if the answer changes:** the same trigger shape recaps uses. Four lines,
plus a `create trigger`.

`locations.map_key` (042) is unpinned the same way and for the same reason —
042 gave the table no BEFORE-UPDATE trigger of its own, so a two-campaign DM
can also move a location's map assignment cross-campaign with an ordinary
update. Same cost, same fix, one trigger doing both jobs if it's ever added.

### Maps have no RLS boundary — the reveal flag does, the image does not (noted 2026-08-20)

042 added multi-map support: `campaign_map_reveals` gates whether a campaign
has revealed a given map, and that table is real, RLS-protected data — a
player cannot flip or forge it. What it gates is not protected by anything.
`src/data/maps.ts` is a plain module compiled into the JS bundle every
authenticated user downloads, images included by reference; `MapView.tsx`'s
`mapsAsPlayer` flag is the only thing standing between a hidden map and a
player's screen, and it is a client-side `if`, not a database policy. Every
other reveal-gated thing in this app (locations, NPCs, their DM notes) is
hidden by RLS before it ever leaves Postgres; this is the first feature where
that is not true.

**Trigger:** none needed for the flag itself — `is_campaign_member`/
`is_campaign_dm` on `campaign_map_reveals` are exactly as solid as every other
policy in this app (042's verification blocks 2 and 3 cover the read and the
write). The gap is reaching the image directly: devtools, a saved page, or
simply reading `src/data/maps.ts` in the deployed bundle.

**Cost:** a picture. Concretely narrower than it sounds, for two reasons
worth keeping rather than hand-waving away: Vite emits each map as a separate
hashed asset referenced by URL, so the bytes are not inlined into the parsed
JS and nothing on a player's screen requests them unless `MapView` actually
renders an `<img>` for that map — reachable, not served. And every pin on
every map stays fully RLS-gated regardless: an unrevealed location's
existence, description and DM notes never leave the database for a real
player, on any map. What could leak is the map art; the DM's actual secrets
about it do not.

Accepted at this size — the threat model is a player glancing at a map on
screen before the DM means them to, not someone deliberately dumping the
bundle, and these are published Curse of Strahd images findable in five
seconds regardless.

**Related gap, same entry:** `Home.tsx`'s dashboard thumbnail always renders
`REGION_MAP.image` unconditionally — it never checks that map's own reveal
flag. Today `REGION_MAP.defaultRevealed` is `true` and realistically stays
that way, so this is currently theoretical, but it means hiding the region
map would not actually remove it from a player's dashboard. Left alone rather
than gated, on the same "not worth it for a picture" reasoning above.

**Fix if the answer changes:** move map images into a Supabase Storage bucket
behind signed URLs, with a storage policy joining `campaign_map_reveals` and
`is_campaign_member` — the real boundary, turning `MapDef.image` into an async
fetch. A day of work and a new failure mode (expiring URLs) to protect a
picture; worth it only if the calculus above changes. If it's ever done, fix
the Home thumbnail gap in the same change rather than leaving it as a second
trip through this reasoning.

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

### `npcs.description` is normalised in the client only (noted 2026-08-14, partly addressed by 035)

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

**What 035 did and did not do.** `035_npc_desc_fix.sql` is the one-time cleanup
of existing rows and nothing else — no trigger change, no constraint. The rule
still lives only in the client.

```sql
-- the whole of 035
update npcs set description = null
where description is not null and trim(description) = '';
```

⚠ **Whether 035 actually ran is unconfirmed.** 036's ledger records it, but data-
only migrations are backfilled on the word of whoever ran the ledger file, and
the after-the-fact check (`select count(*) ... where trim(description) = ''`)
returns 0 both if it ran and if there was never anything to clean. The statement
is idempotent, so the cheap resolution is to run it once more and stop wondering.

**Fix if the answer changes:** mirror what `name` already does — normalise in the
trigger, backstop with a constraint. Clean first, then constrain, or the
constraint will not validate.

```sql
-- in pin_npc_row, beside the name trim
new.description := nullif(btrim(new.description), '');

alter table npcs add constraint npcs_description_check
  check (description is null or (description = trim(description) and description <> ''));
```

Block 9 of `033_npcs_verification.sql` confirms this constraint is **not**
currently present.

### NPCs cannot be created or deleted from the app (noted 2026-08-14)

`npcs` has SELECT and UPDATE policies and deliberately no INSERT and no DELETE.
The roster arrives through the SQL editor, which is also where portraits and
seeded notes are prepared. `034_npc_seed.sql` is written to be copied for this.

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
the folder appears with the first file. Both seeded NPCs land with a null
`portrait_key` for the same reason (034 says so explicitly).

**Fix:** two steps in this order — drop `<key>.webp` into
`src/assets/portraits/`, then a migration setting that NPC's `portrait_key` to
the same key. Doing it the other way round produces a key naming no file, which
is exactly the silent failure the pinning exists to prevent.

Two things that will bite during that work:

- `pin_npc_row` silently no-ops a direct `UPDATE` to `portrait_key`, including
  for the table owner in the SQL editor. Scope an
  `alter table npcs disable trigger pin_npc_row` inside the migration's
  transaction, or the update appears to succeed and changes nothing.
- `import.meta.glob` is eager and resolves at transform time. Restart Vite after
  adding files or the new portrait won't appear.

Prep: 256×256 WebP at ~80 quality; ImageMagick `-gravity north` for the crop.
Human-readable slugs beat uuids as keys — the folder stays browsable.

Related: `public/portraits/strahd.png` is the old hardcoded path and nothing
references it. Delete it — an unreferenced file at a path that used to be
load-bearing is what future-you greps for and gets misled by.

### `truncate locations cascade` now empties `npcs` (noted 2026-08-14)

`npcs` carries a composite FK to `locations`, and `TRUNCATE CASCADE` follows
every foreign key pointing at a table regardless of what that key's `ON DELETE`
action says. The FK's `on delete set null (location_id)` protects a single-row
delete and does nothing here.

**Trigger:** reseeding the map. This project has done it before (015, 026).

**Cost:** the entire NPC roster, silently, as a side effect of a statement about
locations.

**Fix:** `delete from locations where ...` instead of `truncate`, or reseed the
roster after. Flagged at the bottom of `033_npcs.sql` as well as here.

### Removing a player from a campaign destroys their character, gear, spells and feats (noted 2026-08-12, widened by 037 and 041)

`characters` carries a composite FK to `campaign_members (campaign_id, user_id)`
with `on delete cascade`, and `character_inventory.character_id`, — since 037 —
`character_spells.character_id` and — since 041 — `character_feats.character_id`
all cascade from `characters` in turn. So deleting one `campaign_members` row
silently deletes that player's PC, every item on it, every spell on it and every
feat on it, in the same statement, with no intermediate state and nothing to
restore from.

Each new child table widens this by one list without touching the entry, which
is the shape of the problem: the cascade is correct and invisible, and the count
of what it takes only ever goes up.

**Trigger:** any delete against `campaign_members`. There is no kick UI today —
the only paths are leaving a campaign yourself and a manual delete in the
Supabase console — so this is latent rather than live. It is written down now
because the day a "remove player" button is built, the cascade is already wired
and does not appear anywhere near the button that fires it. A DM demoting a
player who missed a session would not expect to be deleting their character
sheet, and the UI would give no sign that they had.

**Cost:** unrecoverable loss of one PC and everything on it. Cheap at this size
(a character is a name, a gear list and a spell list, and reset already exists as
a deliberate version of the same destruction), expensive in surprise, because
nothing in the action's wording implies it.

**Fix if the answer changes:** the cascade itself is right — 028 chose it so that
leaving a campaign takes your character with you rather than stranding a row that
fails its own FK. What is missing is at the call site, not in the schema: any
kick UI needs to name the consequence in its confirm, the way the reset form
already does, and should read the character first so it can name it. If
characters ever need to outlive membership, that is a different change —
`on delete cascade` becomes a nullable `campaign_members` link plus a retirement
flag, which 028 explicitly declined ("there is no retired_at, by decision").

### `removeFromPartyInventory` assumes party gear is common property

Any campaign member may remove any row from the party inventory. That is the
intended model — the party stash belongs to the party — and it matches how
recaps are editable by everyone.

**Fix if the answer changes:** if the DM ever needs sole control of removals, or
if `added_by` is ever meant to confer ownership, the DELETE policy is where that
split goes, not the service. `added_by` is already stamped server-side from
`auth.uid()` in a trigger, so the column is trustworthy enough to gate on.

### `ignoreDuplicates: true` is load-bearing on `character_spells` (noted 2026-08-17)

037 deliberately gives `character_spells` no UPDATE policy — every column is a
key or a defaulted timestamp, so there is nothing an update could change. That
decision is documented in the migration. What is documented nowhere is the client
contract it creates.

supabase-js renders `{ ignoreDuplicates: true }` as
`Prefer: resolution=ignore-duplicates` → `ON CONFLICT DO NOTHING`, which needs
only INSERT privilege. Set it to `false` and PostgREST emits
`ON CONFLICT DO UPDATE` instead; the table-level UPDATE grant still exists, so
the _first_ add succeeds and only the conflicting one fails with 42501.

**Trigger:** anyone editing `addSpellToCharacter` who reads `ignoreDuplicates` as
a preference rather than a requirement.

**Cost:** the worst failure shape this project has — "works once per spell, then
starts refusing mid-session." It is exactly the bug 033 wrote a whole
verification block to catch on `npc_dm_notes`, arriving from the opposite
direction. It will not show up in a first-run smoke test.

**Fix:** one comment in `services/characterSpells.ts` naming the dependency. The
same note belongs on `getOrCreateProfile`, where the argument is different (the
losing insert is expected) but the mechanism is the same.

### The party cache goes stale for a minute after a write from a sheet (noted 2026-08-17, corrected 2026-08-22)

`useCharacterSpells` and `useCharacterInventory` invalidate only their own key.
The same rows are read through a _second_ cache entry, `["party", campaignId]`,
built from `getPartyCharacters`' embeds and consumed by `CharacterRoster` (and by
`Party.tsx`, whose route is currently commented out). `TeachForm`, `GiveForm` and
`Character.tsx`'s `GiveItemForm` hand-invalidate the party key because they know
this; nothing on the character's own sheet does.

**This entry used to say the party cache was "correct only because `staleTime` is
0". That is no longer true and the conclusion inverted with it** —
`lib/queryClient.ts` sets `staleTime: 60_000`, with a comment arguing for it (a
cache that refetches on every mount isn't a cache, and it hides missing
invalidations). So the predicted breakage has already happened, quietly: a spell
or item added from your own sheet leaves the roster's tally wrong until the entry
goes stale or the window is refocused.

**Trigger:** add a spell to your own sheet, then have the DM open the roster
inside the next minute without refocusing the window.

**Cost:** small and real rather than hypothetical. `CharacterRoster` shows counts
only ("3 stacks · 5 spells"), so what's wrong is a number, briefly. It would cost
more the day anything on that cache entry renders content rather than a tally.

**Not widened by 046/047.** The overrides ride `["characterSpells", …]` and
`["characterInventory", …]`, which their own mutations invalidate, and
`PARTY_SELECT` doesn't carry them — the roster shows no descriptions, so there is
nothing new to go stale.

**Fix:** invalidate `["party", campaignId]` inside both character hooks, which
means giving those hooks the campaign id they currently and deliberately do
without. Decide it once, in one sitting, for both.

### The Party page mounts two background queries per character, for the DM (noted 2026-08-17)

`GiveForm` and `TeachForm` write through `useCharacterInventory` and
`useCharacterSpells`, which are queries as well as mutations. A DM viewing a
party of six mounts six gear fetches and six spell fetches that the page never
renders — `useParty` already carried both, in one request.

**Trigger:** the DM opening the Party page. Players don't see the forms and don't
pay the cost.

**Cost:** eleven redundant requests at a party of six, all small and all cached.
Real but negligible at this size.

**Why it's like this:** it buys the repo's rule that a mutation lives in a hook
rather than being wired up ad hoc in a page. That is worth eleven cheap requests.

**Fix if the party grows enough to matter:** `giveItem` and `teachSpell`
mutations on `useParty` — not bare service calls from the page.

### `CharacterSpellRow` asserts the embedded spell is non-null (noted 2026-08-17)

`CHARACTER_SPELLS_SELECT` is `"*, spells(*)"` and the row type declares
`spells: Tables<"spells">`. 037 names the one path that could falsify it: a spell
belonging to another campaign's homebrew, whose `character_spells` row resolves
while 022's SELECT policy filters the embed to null. `toCharacterSpellEntry`
would then call `toSpell(null)` and throw a TypeError rather than a handled
error.

**Trigger:** homebrew spells existing. `spells` has no INSERT policy, so nothing
can create one today.

**Cost:** currently zero. Note that "unreachable because there's no INSERT
policy" is exactly the shape that protected `items` until 025 shipped and made it
reachable — see the Resolved entry below. This is the same bet, one table over,
and 039 has since lost it for feats: `character_feats` has the identical hole and
it is live, because feats shipped with DM homebrew in the same migration as the
table. See "`CharacterFeatRow` asserts the embedded feat is non-null" below for
what that actually costs.

**Fix when spell homebrew lands:** either scope `character_spells`' FK the way
`npcs` scopes its location FK (a composite key that makes the cross-campaign row
unrepresentable), or make the embed nullable in the type and handle it. The FK is
the better answer; the type change is the cheap one.

### `getCharacterSpells` returns rows in no particular order (noted 2026-08-17)

Every sibling service owns its ordering — `getNpcs` orders by name,
`getPartyCharacters` sorts both embeds after mapping. This one has no `.order()`
and no post-sort, and is correct only because every consumer pipes it through
`spellsByLevel`, which sorts.

**Cost:** none today; a surprise for the first consumer that renders the list
raw.

**Fix:** sort in the service after mapping (the DB can't order by the embedded
name usefully), or state in the file that ordering is the caller's job here and
why. Either is fine — the current silence is the problem.

Related and smaller: `getPartyCharacters` sorts `spells` by level-then-name, and
`PartyCharacter.spells` is commented as "already sorted… the order every caller
wants" — but its only consumer immediately re-groups with `spellsByLevel`, which
sorts again. Drop the sort or drop the claim.

### `removeSpellFromCharacter` treats a refused delete as success (noted 2026-08-17)

No zero-row check, matching `removeFromCharacterInventory`. The justification in
the comment — everyone who reaches it already passed `can_edit_character` — is
true only because the remove control renders on your own sheet and nowhere else.

**Trigger:** putting a remove control anywhere a non-owner non-DM can reach it.
The Party panel is the obvious candidate, since Give and Grant already live
there.

**Cost:** a silent success followed by the row reappearing on the next refetch.
Compare `deleteCharacter` and `deleteRecap`, which both use
`.select().maybeSingle()` precisely so a refused delete surfaces.

**Fix:** name the condition in the comment now (one sentence), and add the check
if the control ever moves.

### `feats.repeatable` is display-only; a sheet can hold each feat once (noted 2026-08-19)

041 gives `character_feats` a `unique (character_id, feat_id)`, copied from 037
where it is simply true — a spell is known or it is not. Feats are not all like
that: Elemental Adept and Magic Initiate both say you may take them again, and
the seed marks them `repeatable = true`. The card and the row print the flag, and
the second add is silently swallowed by the same `ignoreDuplicates` that makes an
accidental double-add a no-op. Nothing tells the player the difference.

**Trigger:** taking either of those two feats twice. 041's BLOCK 5 is the case,
written from the accident side.

**Cost:** two feats out of forty-two, on a sheet that records no level either, so
"took it at 8 and again at 12" is not expressible in the first place.

**Fix:** a `times_taken int not null default 1 check (times_taken > 0)` and 030's
insert-or-increment RPC, since PostgREST cannot express increment — which is the
whole apparatus `character_spells` was designed to avoid. Worth it only if
someone actually hits this. Cheaper interim: have the picker disable a feat
already on the sheet, so the no-op is visible rather than silent.

### `feats.prerequisite` is text nothing can check (noted 2026-08-19)

The column holds strings like "Strength 13 or higher" and "Proficiency with heavy
armor". `characters` stores a name, a campaign and an owner — no level, no class,
no ability scores, no proficiencies — so there is nothing to evaluate them
against, in the database or the client. Eleven of the forty-two seeded feats carry
one and any player can take any of them.

**Cost:** none as a bug; the app is a shared reference sheet, and the DM at the
table is the enforcement layer. It is written down because "prerequisite" is a
word that implies a check, and the next person to read the schema will look for
one.

**Fix:** nothing, unless characters grow stats. If they ever do, the honest
version is a warning beside the picker rather than a disabled option — a DM
waiving a prerequisite is a normal thing to do, and a hard block would be wrong.

### `CharacterFeatRow` asserts the embedded feat is non-null (noted 2026-08-19)

The spells version of this entry is above, and is currently unreachable. This one
is not. `CHARACTER_FEATS_SELECT` is `"*, feats(*)"` with the row type declaring
`feats: Tables<"feats">`, and 039 ships a working INSERT policy — so a DM who
belongs to two campaigns can create a homebrew feat in campaign B and attach it to
a character in campaign A, where 039's SELECT policy filters the embed to null and
`toCharacterFeatEntry` calls `toFeat(null)` and throws a TypeError. 041's BLOCK 6
demonstrates exactly this rather than asserting it away.

**Trigger:** a hand-made request. The UI cannot produce it — the picker is fed by
`getFeats(campaignId)`, which is already scoped to shared-plus-this-campaign — so
reaching it means calling PostgREST directly with a feat id from elsewhere.

**Cost:** one character's Feats panel throws instead of rendering, for everyone
who can see that character, until the row is deleted in the SQL editor. Not a
leak: the feat's contents stay invisible, which is what makes the embed null in
the first place.

**Fix:** the composite-FK answer the spells entry prefers does not work here —
shared feats have a null `campaign_id` and would match nothing — so it is either a
BEFORE INSERT trigger re-deriving the character's campaign and rejecting a
mismatch, or making the embed nullable in the type and dropping the row from the
list. The trigger is the right one; the type change is a two-line stopgap.

### `getCharacterFeats` returns rows in no particular order (noted 2026-08-19)

The same gap as `getCharacterSpells` above, made the same way: no `.order()`, no
post-sort, correct only because every consumer pipes it through
`featsByCategory`, which sorts. Copied knowingly, so it is copied here too rather
than left for someone to find twice.

**Fix:** whatever is decided for the spells version, applied to both in one edit.

### `removeFeatFromCharacter` treats a refused delete as success (noted 2026-08-19)

`removeSpellFromCharacter`'s entry above, one table over and with the same
justification and the same dependency on it: the remove control renders on your
own sheet and nowhere else, so nobody who can press it can be refused. The Party
panel is the trigger for both.

**Fix:** whichever way the spells one goes.

### `useCharacterFeats` invalidates only its own key (noted 2026-08-19)

`["characterFeats", characterId]` and nothing else, matching `useCharacterSpells`.
Today that is complete, because the Feats panel on the sheet is the only thing
that reads character feats. The Party page's `TeachForm` had to invalidate
`["party", campaignId]` by hand for exactly this reason, and a feats embed in
`PARTY_SELECT` would need the same hand-written second invalidation.

**Trigger:** the Party page coming back (its route and nav link are commented out
as of `6b7dee5`) with feats added to its embed.

**Fix:** the same one the spells entry wants — a mutation that invalidates both
keys, or a shared invalidator that knows a character belongs to a campaign.

### Player preview is a per-page discipline with nothing enforcing it (noted 2026-08-19)

Preview is two independent opt-ins that every page has to remember separately:
`asPlayer: previewing` on each reveal-gated read, and `showDmUi` in place of
`campaign.isDm` on each DM control. Nothing checks that a page did either. A new
page is preview-blind by default, and a preview-blind page looks completely
normal — the leak is only visible to someone who knows what the row should have
said.

That is how three of them accumulated on Home.tsx, the page a DM lands on
straight after toggling: an unfiltered `useLocations` drawing a pin at the true
coordinates of every unrevealed location, a "Roads Known" count reading 4 / 17
where a player sees 4 / 4, and a band captioned "For the DM's eyes only" still
standing in player view. All three fixed 2026-08-19, along with the same gate on
Inventory's forge link, Recaps' New-recap form and Delete, and Party's Give and
Teach footers.

**Trigger:** adding a page, or adding a reveal-gated read to an existing one.

**Cost:** the mode exists to be trusted. A DM who has checked the dashboard in
preview and found it clean has been told something false about their table.

**Fix:** the two halves want different answers. The reads could stop being
opt-in — a `useRevealGated` wrapper, or the preview flag moving into the query
layer — but the hooks deliberately take `asPlayer` as an argument rather than
reading the context, so that they stay data and work outside the provider, and
that is worth keeping. The controls are the more tractable half: `showDmUi` is
recomputed identically in six files now, and belongs on the campaign context
beside `isDm` where a page gets it without knowing to ask.

Note the coupling, which is what makes this worse than a checklist item: fixing
only the read half is a **regression**, not a partial fix. Home's DM band counts
`hidden` and `annotated` off the location list, so filtering the list without
also hiding the band leaves it confidently reporting "Every road revealed" while
ten locations are hidden. Any page doing both must change both in one edit.

### `asPlayerView` cannot filter a field that came from another table (noted 2026-08-19)

`asPlayerView` filters `isRevealed` and strips `dmNotes` — both fields of the row
it is given. `Npc.locationName` is neither: it is denormalised out of
`locations ( name )` in NPC_SELECT, so it answers to **locations'** RLS, not
npcs'. A player's copy of an NPC standing somewhere unrevealed arrives with
`locations: null`; a previewing DM's still carried the name until 2026-08-19.

Fixed by `hideUnseenLocationNames` in `lib/playerView.ts`, called from NPC.tsx
because that page is the only place the NPC list and the previewed location list
meet.

**Trigger:** any future embed of a reveal-gated table into a differently-gated
one. The pattern to watch for is a field whose null-ness is decided by a policy
on a table other than the row's own.

**Cost:** currently zero — the one case is fixed. Recorded because the general
shape is invisible: nothing about `locationName: string | null` says the null is
load-bearing, and `Npc`'s own comment describing it ("the home is a location this
viewer cannot see") was already correct while the preview path quietly wasn't.

### Description rows outlive the gear they describe (noted 2026-08-22)

047 keys `character_item_descriptions` on `(character_id, item_id)` rather than
on the `character_inventory` row, precisely so a description survives a
stow-and-take and a decrement to zero. The other half of that choice is that
nothing ever cleans one up: sell the sword for good and the row you wrote about
it stays behind, unreachable from any screen, until the day that character owns a
sword again — at which point your old words reappear on it.

**Trigger:** permanently parting with an item you had written about.

**Cost:** one narrow row per abandoned idea, at a table of five. The reappearance
is arguably the feature working — it is the same character and the same kind of
object — but it will surprise someone eventually.

**Fix if it ever matters:** nothing automatic. A trigger on
`character_inventory` DELETE would defeat the entire point of the key. If the
rows ever need clearing it wants a deliberate control ("forget this"), or a
periodic sweep of overrides whose `(character_id, item_id)` matches no stack and
whose `updated_at` is old. Neither is worth writing yet.

### Lists sort on the catalogue name while the row shows the custom one (noted 2026-08-22)

`spellsByLevel` groups and sorts on `entry.name`, and `CharacterCarried`'s "first
four" sorts the same way, but both now print `customName ?? name`. So a player
who renames Fireball to "Grandmother's Hearth" finds it filed under F.

**Why it's like this:** `spellsByLevel` is generic and shared with the grimoire,
where there is no custom name to sort by, so threading a display-name comparator
through it would push the feature into a function that has nothing to do with it.
The row prints the catalogue name beside the custom one, so the ordering is at
least explicable on sight rather than arbitrary.

**Cost:** mild confusion on a list long enough to scan. A sheet holds a dozen
spells.

**Fix:** an optional comparator argument on `spellsByLevel`, defaulted to the
current one. Cheap, just not yet earned.

### The pickers and the grimoire show only catalogue names (noted 2026-08-22)

The "Choose a spell…" and "Choose an item…" selects are fed by `getSpells` /
`getItems` — the shared catalogue, which has no character and therefore no
override. So a player who renamed something and wants to add another one has to
remember what the book calls it.

**Cost:** near zero. Adding a second of something you already carry goes through
the pack's own `+`-shaped paths, not the picker, and the picker is where you go
for things you don't have yet.

**Fix:** the pickers would have to merge the character's override map over the
catalogue list. Doable in the page; not worth the coupling for the case it
serves.

### The DM cannot write item descriptions, only spell ones (noted 2026-08-22)

046 and 047 both gate writes on `can_edit_character`, so the campaign's DM may
write either. But the only door to an item's description is the pack's inspect
card on `Inventory.tsx`, and that page is always "mine" — there is no path onto
another character's pack from it. Spells are fine: `CharacterDetail` renders the
same `CharacterSheet` for a DM, spell card included.

**Trigger:** a DM wanting to hand out a magic item that arrives already carrying
its story.

**Cost:** the DM types it in chat instead. `GiveItemForm` on the character sheet
can already put the item in the pack; only the words are missing.

**Fix:** an inspect card on `CharacterCarried`, which is today deliberately a
summary strip and a link. That is a real design change to that band, not a
plumbing job — the RLS half already permits it.

### `035_npc_desc_fix.sql` has no header comment (noted 2026-08-17)

Two bare lines of SQL. Every other file in `db/` opens with a paragraph
explaining what it does and why, and that convention is load-bearing for more
than readability: a file with no prose is effectively unsearchable, which is how
a review of migrations 034–037 managed to conclude the file wasn't committed at
all.

**Fix:** three lines at the top saying what it cleans and that it is idempotent.

---

## Minor

Small, understood, not worth an entry of their own.

- **`formatPrice` deferred.** Prices are integer copper and display as
  `price_cp / 100`, so sub-gold items render as "0.01 gold". More visible since
  the general-item seed added many sub-gold entries.
- **Dead campaign uuid in old migrations.** `00000000-…-0001` (015, 005)
  references a campaign that does not exist in this database. It misled the NPC
  seed work once already. 026 reseeded locations campaign-scoped; the literal
  survives in the older files.
- **Double `console.error` on a failed NPC save.** `updateNpc` logs the Supabase
  error and `NpcEditor`'s catch logs again. One failure, two entries. The same
  pattern is now in `characterSpells.ts` and its callers.
- **A player attempting `update npc_dm_notes` is untested.** Covered by
  inspection rather than execution: block 9 of the verification shows its USING
  and WITH CHECK are the same `is_campaign_dm` expression that block 8 proves
  refuses a player on INSERT.
- **Comment cleanup backlog.** AI-assisted sessions left comments that narrate
  edit history and cite migration numbers ("013 changed…", "007's trigger…")
  rather than explaining the code in front of the reader. Per-file with review,
  not one agentic sweep.
- **`characters.ts` casts `data as PartyCharacterRow[]`.** The only hand-written
  row shape left; `PARTY_SELECT`'s three embeds defeat inference. Contained to
  one line, and the type next to it is honest about what it's asserting.

---

## Resolved

### Nothing recorded which migrations had been applied (noted 2026-08-14, resolved by 036)

`db/` was declared ground truth while the database held no record of which files
in it had run. The two were compared only by accident — by someone regenerating
`database.types.ts` and noticing the diff, or by a feature failing in front of a
player. The 2026-08-13 episode was the illustration: three inventory RPCs came
back `PGRST202`, were read as "030 and 032 never ran", and re-running them fixed
it — which is also exactly what a stale PostgREST schema cache would have looked
like, since `create or replace function` emits a DDL event and forces a reload.

`036_schema_migrations.sql` creates the ledger and backfills 000–036 behind a
guard that raises if any migration's durable objects are missing, so the backfill
cannot record a claim the catalog contradicts. From 037 on, every migration ends
with a bare `insert into schema_migrations (version) values ('0NN');` inside its
own transaction — no `on conflict`, so a re-run fails on the primary key and a
half-run leaves no entry.

**What is still assumed rather than proven:** data-only migrations (002 003 005
017 023 024 026 034 035) have no object to check for and were recorded on the
word of whoever ran the file. And the original 030/032 question — stale cache or
never ran — was never settled; it is now simply answerable, which was the point.

Worth keeping: `PGRST202` means _not found in the schema cache_, not _does not
exist_. `notify pgrst, 'reload schema';` first, `pg_proc` before touching a
migration file.

### The decrement path was the last read-modify-write in the app (resolved by 032)

030 and 031 made adds insert-or-increment through an RPC, and left decrement
reading `currentQuantity` in the client and shipping back `quantity - 1` — so two
concurrent decrements lost one. 030 also made it _more_ reachable: stacks used to
fragment across rows, so two people spending arrows were often editing different
rows; afterwards every copy funnels into one row that both the owner and the DM
can decrement mid-session.

032 moved the branch into plpgsql behind a `select ... for update`. The lock is
the part that matters — the lock-free `update ... where quantity > 1` then
delete-if-no-rows is correct against a concurrent decrement but loses both copies
against a concurrent _add_ that bumps a stack of 1 to 2 in the window. Both
functions are `security invoker`, so RLS remains the boundary.

032 also dropped `character_inventory_character_id_idx`, which 030's unique
constraint had made redundant and which 030 deliberately deferred.

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

The same shape was carried into `037_character_spells.sql`: block 2 proves the
campaign DM may write to a player's sheet, block 3 proves another _member_ may
not, and block 3's subject is deliberately made a plain member first — as a
non-member they'd be stopped by the outer half of the check and the block would
prove the weaker thing.

### NPCs were filtered client-side (resolved by 033/034)

`NPC.tsx` held a hardcoded `NPCS` array and rendered `NPCS.filter(n =>
n.is_revealed)` — the exact anti-pattern the reveal-gating principle bans, not
leaking only because the data was static and identical for everyone. 033 gave
NPCs the locations treatment: `campaign_id` NOT NULL, an `npc_dm_notes` sibling
reached by a fail-closed join, and a SELECT policy of
`is_campaign_dm(campaign_id) or (is_revealed and is_campaign_member(campaign_id))`.
034 moved the roster into it. The page has no reveal filter now; `isDm` survives
only to render the editors and style the hidden rows a DM still receives.

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
duplicate the row. Resolved by the move to TanStack Query: the mint invalidates
and the list comes back from the server, so there is no local prepend to race.
