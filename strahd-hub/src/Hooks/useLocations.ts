import { useEffect, useState } from "react";
import { Location, getLocations } from "../services/locations";

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]); // success: the rows
  const [loading, setLoading] = useState(true); // waiting
  const [error, setError] = useState<string | null>(null); // failure

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
  return { locations, loading, error };
}
