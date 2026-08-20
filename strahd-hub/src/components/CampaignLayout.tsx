import {
  Link,
  Navigate,
  Outlet,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { useCampaigns } from "../hooks/useCampaigns";
import { Campaign } from "../services/campaigns";
import { PlayerPreviewProvider, usePlayerPreview } from "./PlayerPreviewContext";
import "./playerPreview.css";

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

  return (
    // key: the preview flag belongs to the campaign it was raised in. Changing
    // campaigns re-renders this component rather than remounting it — same
    // route, new param — so without the key a preview would silently follow the
    // DM into the next campaign.
    <PlayerPreviewProvider key={campaign.id}>
      <PlayerPreviewBanner />
      <Outlet context={campaign} />
    </PlayerPreviewProvider>
  );
}

/**
 * Rendered above the outlet rather than by a page, so that no page can be the
 * reason the way out isn't on screen. This matters more than it looks: a
 * preview mode with nothing announcing it is indistinguishable from a campaign
 * that has lost half its content.
 *
 * No isDm check — the flag can only be raised by the rail's toggle, which has
 * one.
 */
function PlayerPreviewBanner() {
  const { previewing, setPreviewing } = usePlayerPreview();
  if (!previewing) return null;

  return (
    <div className="preview-banner" role="status">
      <span className="preview-banner__label">Player view</span>
      {/* States the whole contract, because a partial promise is what let the
          gaps hide: the old copy named only the hidden rows and the notes, so a
          DM band still standing on the dashboard read as intended rather than
          as a leak. Three clauses, one per thing preview actually does. */}
      <span className="preview-banner__note">
        Unrevealed NPCs and locations are hidden, your DM notes are gone, and
        your DM controls are put away. Nothing about the campaign has changed.
      </span>
      <button
        className="preview-banner__exit"
        onClick={() => setPreviewing(false)}
      >
        Exit player view
      </button>
    </div>
  );
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
