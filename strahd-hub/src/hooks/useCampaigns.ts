import { useCallback, useEffect, useState } from "react";
import {
  Campaign,
  createCampaign,
  getCampaigns,
  updateCampaignName,
} from "../services/campaigns";

// Two very different callers share this: the picker, which lists what you can
// open, and CampaignLayout, which checks a URL param against the same list.
// That's on purpose — "campaigns you can see" is one answer, so a campaign that
// isn't pickable can't be reachable by typing its id either.
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getCampaigns();
        if (!ignore) setCampaigns(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(
            err instanceof Error ? err.message : "Failed to load campaigns",
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

  // Rejects on failure instead of setting `error` above — same split as
  // useRecaps. `error` means "there is no list to show at all"; a create that
  // fails still has a page full of good campaigns behind it, and the form that
  // called it is the thing that should say what went wrong.
  const addCampaign = useCallback(async (name: string) => {
    const id = await createCampaign(name);
    // Assembled here rather than refetched: create_campaign hands back an id and
    // nothing else, and the only other field this list shows is the name that
    // was just sent to it. Appended rather than sorted in, because getCampaigns
    // orders by created_at and this row is by definition the newest one.
    setCampaigns((cur) => [...cur, { id, name: name.trim() }]);
    // Returned as well as stored. Local state is for the list behind you; the
    // return value is what lets the caller navigate into the campaign it just
    // made, which needs an id that didn't exist until the call came back.
    return id;
  }, []);

  // Rejects on failure for the same reason addCampaign does: a rename that
  // fails leaves a page full of good campaigns behind it, so the form that
  // called it is what should say so.
  const renameCampaign = useCallback(async (id: string, name: string) => {
    const saved = await updateCampaignName(id, name);
    // Replaced in place rather than re-sorted or refetched: the list is ordered
    // by created_at, and a rename doesn't move a row.
    setCampaigns((cur) => cur.map((c) => (c.id === id ? saved : c)));
  }, []);

  return { campaigns, loading, error, addCampaign, renameCampaign };
}
