import { useEffect, useState } from "react";
import { Spell, getSpells } from "../services/spells";
import { errorMessage } from "../lib/errors";

export function useSpells() {
  const [spells, setSpells] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getSpells();
        if (!ignore) setSpells(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load spells"));
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
  return { spells, loading, error };
}
