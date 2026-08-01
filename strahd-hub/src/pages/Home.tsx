import { Link } from "react-router-dom";

export function Home() {
  return (
    <div>
      <h1>Welcome to Curse of Strahd</h1>
      {/* Links styled as buttons, not links wrapping buttons — a <button>
          inside an <a> is invalid HTML, and nesting two focusable controls
          gives keyboard users two stops for one destination.

          Relative, like the nav: this page is the campaign index, so "Shop"
          resolves to /campaign/:campaignId/Shop. */}
      <Link className="btn" to="Shop">
        Shop
      </Link>
      <Link className="btn" to="Maps">
        Maps
      </Link>
      <Link className="btn" to="Spells">
        Spells
      </Link>
      <Link className="btn" to="NPC">
        NPCs
      </Link>
      <Link className="btn" to="Recaps">
        Recaps
      </Link>
    </div>
  );
}
