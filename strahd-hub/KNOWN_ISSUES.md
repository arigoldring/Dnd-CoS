# Known issues

Things that are wrong on purpose — understood, judged not worth fixing at this
size, and written down so they stay decisions rather than becoming discoveries.
Each entry says what it takes to trigger, what it costs, and what the fix would
be if the answer ever changes.

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
