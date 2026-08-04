import { useCallback, useEffect, useState } from "react";
import {
  Recap,
  createRecap,
  deleteRecap,
  getRecaps,
  updateRecap,
} from "../services/recaps";
import { errorMessage } from "../lib/errors";

export function useRecaps(campaignId: string) {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      // Reset on every campaign change, not just on mount: this component stays
      // mounted when a DM navigates between campaigns (same <Recaps> route, only
      // the param changes), so without this the previous campaign's log lingers
      // until the new fetch lands.
      setLoading(true);
      setError(null);
      try {
        const data = await getRecaps(campaignId);
        if (!ignore) setRecaps(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load recaps"));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    // `ignore` keeps a switch race safe: an in-flight fetch for the old campaign
    // can resolve after the new one was requested, and this drops it rather than
    // letting it paint the wrong campaign's recaps.
    return () => {
      ignore = true;
    };
  }, [campaignId]);

  // The three mutations live beside the fetch so this hook stays the one owner
  // of the list: each patches local state from the row the server sent back,
  // rather than refetching everything to pick up one change.
  //
  // All three REJECT on failure instead of setting `error` above — that state
  // means "the page has no data to show at all". A save that fails still has a
  // page full of good recaps behind it, and the form that called it is the
  // thing that should say what went wrong.

  // campaignId is closed over from the hook argument rather than passed per
  // call: now that the read above is scoped, this hook has a "current campaign"
  // and a new recap files against the same one the list is showing. This is the
  // migration the old comment here promised — the read got scoped the way
  // getInvites is, so campaignId came back out of this signature.
  const addRecap = useCallback(
    async (sessionNumber: number, title: string, body: string) => {
      const created = await createRecap(campaignId, sessionNumber, title, body);
      // Sorted in, not prepended. The list is ordered by session number
      // descending, and the DM can backfill an older session — a new Session 2
      // written after Session 5 belongs between 3 and 1, not at the top.
      setRecaps((cur) =>
        [...cur, created].sort((a, b) => b.sessionNumber - a.sessionNumber),
      );
    },
    [campaignId],
  );

  const saveRecap = useCallback(
    async (id: string, title: string, body: string) => {
      const saved = await updateRecap(id, title, body);
      // Replaced wholesale rather than spread over: the returned row carries a
      // fresh byline from the trigger, so patching only title and body would
      // leave the old "last edited by" on screen next to the new text.
      setRecaps((cur) => cur.map((recap) => (recap.id === id ? saved : recap)));
    },
    [],
  );

  const removeRecap = useCallback(async (id: string) => {
    await deleteRecap(id);
    setRecaps((cur) => cur.filter((recap) => recap.id !== id));
  }, []);

  return { recaps, loading, error, addRecap, saveRecap, removeRecap };
}
