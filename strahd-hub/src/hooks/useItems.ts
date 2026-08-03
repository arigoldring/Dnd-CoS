import { useEffect, useState } from "react";
import { Item, getItems } from "../services/items";
import { errorMessage } from "../lib/errors";

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getItems();
        if (!ignore) setItems(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load items"));
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
  return { items, loading, error };
}
