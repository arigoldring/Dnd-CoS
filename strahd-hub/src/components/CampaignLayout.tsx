import {
  Link,
  Navigate,
  Outlet,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { useCampaigns } from "../hooks/useCampaigns";
import { Campaign } from "../services/campaigns";

/**
 * The gate on every campaign-scoped route, in the same shape as AuthGate:
 * resolve first, then decide, and render nothing below until there is a real
 * campaign to render it for. That's what lets a page under /campaign/:campaignId
 * take its campaign as a given instead of re-deriving it and handling null.
 */
export function CampaignLayout() {
  const { campaignId } = useParams();
  const { data: campaigns = [], isLoading: loading, error } = useCampaigns();

  if (loading) return <p>Loading...</p>;
  if (error)
    return (
      <div>
        <p>{error.message}</p>
        <Link to="/">Back to campaigns</Link>
      </div>
    );

  // The param is user input: typed, bookmarked, shared, or left over from a
  // campaign the player has since been removed from. Checking it against the
  // list — the same list the picker shows — is what turns all of those into a
  // redirect rather than a page that queries a campaign the user can't read.
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) return <Navigate to="/" replace />;

  return <Outlet context={campaign} />;
}

/**
 * Typed accessor for the campaign the layout above put on the outlet, so pages
 * don't reach for useOutletContext and re-state its type at each call site.
 *
 * Non-null by construction, not by assertion: this only resolves inside a route
 * nested under CampaignLayout, and that component has already proven the
 * campaign exists and is visible to this user before rendering its Outlet.
 */
export function useCampaign(): Campaign {
  return useOutletContext<Campaign>();
}
