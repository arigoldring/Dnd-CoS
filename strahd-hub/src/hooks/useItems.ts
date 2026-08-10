import { getItems } from "../services/items";
import { useQuery } from "@tanstack/react-query";

export function useItems() {
  return useQuery({ queryKey: ["items"], queryFn: getItems });
}
