import { useCallback, useEffect, useState } from "react";
import { Campaign, createCampaign, getCampaigns } from "../services/campaigns";

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
    const created = await createCampaign(name);
    // Appended rather than sorted in: getCampaigns orders by created_at, and
    // the row that was just inserted is by definition the newest one.
    setCampaigns((cur) => [...cur, created]);
    // Returned as well as stored. Local state is for the list behind you; the
    // return value is what lets the caller navigate into the campaign it just
    // made, which needs an id that didn't exist until the insert came back.
    return created;
  }, []);

  return { campaigns, loading, error, addCampaign };
}
