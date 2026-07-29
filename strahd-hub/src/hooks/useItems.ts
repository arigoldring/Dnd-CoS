import { useEffect, useState } from "react";
import { Item, getItems } from "../services/items";

export function useItems() {
  const [items, setItems] = useState<Item[]>([]); // success: the rows
  const [loading, setLoading] = useState(true); // waiting
  const [error, setError] = useState<string | null>(null); // failure

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getItems();
        if (!ignore) setItems(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(err instanceof Error ? err.message : "Failed to load items");
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
