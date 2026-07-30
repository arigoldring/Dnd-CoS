import { useCallback, useEffect, useState } from "react";
import {
  Location,
  getLocations,
  updateLocationDescription,
} from "../services/locations";

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getLocations();
        if (!ignore) setLocations(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(
            err instanceof Error ? err.message : "Failed to load locations",
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

  // The mutation lives beside the fetch so this hook stays the one owner of
  // the list: on success we patch the single edited row instead of refetching
  // every location to pick up one field.
  //
  // Failures REJECT rather than landing in `error` above — that state is for
  // "the page has no data to show". A failed save still has a page full of
  // good data; the form that called this is the thing that should say so.
  const saveDescription = useCallback(
    async (id: string, description: string) => {
      const saved = await updateLocationDescription(id, description);
      setLocations((cur) =>
        cur.map((loc) => (loc.id === id ? { ...loc, description: saved } : loc)),
      );
    },
    [],
  );

  return { locations, loading, error, saveDescription };
}
