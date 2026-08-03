# Known issues

Things that are wrong on purpose — understood, judged not worth fixing at this
size, and written down so they stay decisions rather than becoming discoveries.
Each entry says what it takes to trigger, what it costs, and what the fix would
be if the answer ever changes.

---

## Same-campaign duplicate invite after a double navigation

**Where:** `addInvite` in [src/hooks/useInvites.ts](src/hooks/useInvites.ts)
**Severity:** cosmetic, self-healing. Nothing is written wrongly; the database is
correct in every case below.
**Noted:** 2026-08-02

### What happens

`addInvite` guards its `setInvites` on `shownCampaignId.current === campaignId`,
which closes the cross-campaign case: a code minted for campaign A can never be
prepended onto campaign B's list. It does not close the case where the list
reloads for the *same* campaign while the mint is still in flight.

1. Viewing campaign A, the DM clicks mint. `createInvite(A, label)` starts — two
   round trips: the `generate_player_invite` RPC, then the read-back select.
2. The DM switches to B. The load effect's cleanup sets `ignore = true` for A's
   fetch, the ref moves to B, and B's list loads.
3. The DM switches back to A. The ref moves back to A and `getInvites(A)` runs.
   If the mint's RPC has already committed by now — it is the first of its two
   round trips — this query returns the new code among A's rows, and state is set
   to a list that already contains it.
4. The original `createInvite` promise finally resolves. The campaign guard
   passes, because the shown campaign really is A again, and the updater prepends
   a row that is already in `cur`.

The result is the same invite twice, with the same `id`, which React reports as a
duplicate key. The next successful load overwrites the array wholesale and it is
gone.

### Why it is not fixed

It needs the first-fired async operation to resolve dead last — after two
navigations and a completed reload of the campaign it started in. At five to ten
users, on a screen a DM opens to mint a code and then leaves, that ordering is
not going to happen, and if it does the cost is a briefly doubled row in a list.

### The fix, if it ever matters

Make the prepend idempotent in the updater:

```ts
setInvites((cur) =>
  cur.some((i) => i.id === created.id) ? cur : [created, ...cur],
);
```

**This does not replace the campaign guard, and neither one subsumes the other.**
They cover different halves. A cross-campaign duplicate is not present in the
other campaign's list, so `some` returns false and the dedupe alone would still
drop A's code onto B's screen — the guard is the one that matters. The dedupe
only makes the prepend safe against load ordering within one campaign. Keep both
or keep the guard; never swap one for the other.

### Not applicable to `useDmInvites`

The same `addInvite` shape is there without the hazard: that hook takes no
argument, loads once per mount, and has no refetch for an in-flight mint to race
with. A remount starts from a fresh empty list, and the old closure's
`setInvites` targets a component that no longer exists, which React ignores.
