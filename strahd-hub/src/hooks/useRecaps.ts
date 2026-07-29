import { useCallback, useEffect, useState } from "react";
import {
  Recap,
  createRecap,
  deleteRecap,
  getRecaps,
  updateRecap,
} from "../services/recaps";

export function useRecaps() {
  const [recaps, setRecaps] = useState<Recap[]>([]); // success: the rows
  const [loading, setLoading] = useState(true); // waiting
  const [error, setError] = useState<string | null>(null); // failure

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getRecaps();
        if (!ignore) setRecaps(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(
            err instanceof Error ? err.message : "Failed to load recaps",
          );
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // The three mutations live beside the fetch so this hook stays the one owner
  // of the list: each patches local state from the row the server sent back,
  // rather than refetching everything to pick up one change.
  //
  // All three REJECT on failure instead of setting `error` above — that state
  // means "the page has no data to show at all". A save that fails still has a
  // page full of good recaps behind it, and the form that called it is the
  // thing that should say what went wrong.

  const addRecap = useCallback(
    async (sessionNumber: number, title: string, body: string) => {
      const created = await createRecap(sessionNumber, title, body);
      // Sorted in, not prepended. The list is ordered by session number
      // descending, and the DM can backfill an older session — a new Session 2
      // written after Session 5 belongs between 3 and 1, not at the top.
      setRecaps((cur) =>
        [...cur, created].sort((a, b) => b.sessionNumber - a.sessionNumber),
      );
    },
    [],
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
