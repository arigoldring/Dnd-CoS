# Known issues

Things that are wrong on purpose — understood, judged not worth fixing at this
size, and written down so they stay decisions rather than becoming discoveries.
Each entry says what it takes to trigger, what it costs, and what the fix would
be if the answer ever changes.

---

## Resolved

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
