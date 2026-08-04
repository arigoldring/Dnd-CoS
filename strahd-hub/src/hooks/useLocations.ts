import { useCallback, useEffect, useState } from "react";
import {
  Location,
  getLocations,
  updateLocationDescription,
} from "../services/locations";
import { errorMessage } from "../lib/errors";

export function useLocations(campaignId: string) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      // Reset on every campaign change, not just on mount: this component stays
      // mounted when a DM navigates between campaigns (same <Maps> route, only
      // the param changes), so without this the previous campaign's pins linger
      // on the map until the new fetch lands.
      setLoading(true);
      setError(null);
      try {
        const data = await getLocations(campaignId);
        if (!ignore) setLocations(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load locations"));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    // `ignore` keeps a switch race safe: an in-flight fetch for the old campaign
    // can resolve after the new one was requested, and this drops it rather than
    // letting it paint the wrong campaign's pins.
    return () => {
      ignore = true;
    };
  }, [campaignId]);

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
