# Known issues

Things that are wrong on purpose — understood, judged not worth fixing at this
size, and written down so they stay decisions rather than becoming discoveries.
Each entry says what it takes to trigger, what it costs, and what the fix would
be if the answer ever changes.

---

## Open

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

---

## Resolved

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

---

removeFromPartyInventory - if a permission split ever happens needs to be changed
