import regionMapImage from "../assets/Maps/barovia.webp";
import villageMapImage from "../assets/Maps/village-of-barovia.jpg";

/**
 * The map registry. Static imports, not import.meta.glob (compare
 * PORTRAITS in NPC.tsx): the database there stores a bare key and the client
 * must survive one that names no file, because the roster arrives out of band
 * through the SQL editor. Here the registry names its own file, so a missing
 * one should be a build failure, not a lookup that quietly returns undefined.
 * Imitate NPC's card grid on the index page; do not imitate its glob.
 *
 * `id` is written into database rows (locations.map_key and
 * campaign_map_reveals.map_key). It looks like a free-form slug; it is not --
 * renaming it later is a data migration (`update locations set map_key = ...`,
 * and the same on campaign_map_reveals), not a rename.
 *
 * `defaultRevealed` only applies until a campaign's DM touches this map's
 * toggle. Once a campaign_map_reveals row exists for (campaign, map), it wins
 * forever, including after this default changes -- an explicit DM choice beats
 * a registry default, always.
 *
 * THE HONEST PART. Unlike locations and npcs, RLS cannot hide a map here, and
 * nothing else does either. This module is a client bundle compiled into every
 * authenticated user's download -- campaign_map_reveals is a real,
 * RLS-protected table, so the FLAG a player receives is trustworthy and cannot
 * be forged; the IMAGE it gates is not protected by anything. Two things
 * genuinely narrow this rather than it being pure hand-waving:
 *
 *   - Vite emits each image as a separate hashed asset referenced by URL, so
 *     the bytes are not inlined into the JS a player's browser parses, and
 *     nothing on a player's screen ever requests them unless MapView.tsx
 *     renders an <img> for that map. The image is reachable, not served --
 *     seeing it takes deliberate devtools poking, not an accidental render.
 *   - The pins remain fully RLS-gated regardless: unrevealed locations,
 *     their descriptions and their DM notes never leave the database for a
 *     real player, on any map. What a determined player could dig up is a
 *     picture; the DM's actual secrets about it do not travel with it.
 *
 * Accepted at this size -- the threat model is a player glancing at a map on
 * screen before the DM means them to, not one deliberately dumping the bundle,
 * and these are published Curse of Strahd images findable in five seconds
 * regardless. A real boundary would move images into a Supabase Storage
 * bucket behind signed URLs (a storage policy joining campaign_map_reveals and
 * is_campaign_member), turning MapDef.image into an async fetch -- a day of
 * work and a new failure mode (expiring URLs) to protect a picture. Worth
 * revisiting if that calculus ever changes; not worth building today. See
 * MapView.tsx's mapsAsPlayer comment for where this boundary is actually
 * enforced (client-side, and only there), and KNOWN_ISSUES.md for the same
 * note plus the Home.tsx thumbnail gap it doesn't cover.
 *
 * No Supabase import here. Merging this registry with a campaign's
 * campaign_map_reveals rows happens in useMaps.ts, not here -- this module is
 * pure content.
 */
export interface MapDef {
  /** URL segment AND the map_key stored in the database. */
  id: string;
  title: string;
  subtitle: string;
  /** Vite's hashed URL for the bundled image. */
  image: string;
  /** Used only when no campaign_map_reveals row exists for this map yet. */
  defaultRevealed: boolean;
}

// Exported by name so Home.tsx can stop importing barovia.webp a second time.
// home.css:197's `aspect-ratio: 2413 / 1547` is hardcoded to this image and
// must change if REGION_MAP.image ever does.
export const REGION_MAP: MapDef = {
  id: "barovia",
  title: "Barovia",
  subtitle: "The valley, in full",
  image: regionMapImage,
  defaultRevealed: true,
};

const VILLAGE_MAP: MapDef = {
  id: "village-of-barovia",
  title: "Village of Barovia",
  subtitle: "Area E",
  image: villageMapImage,
  defaultRevealed: false,
};

export const MAPS: readonly MapDef[] = [REGION_MAP, VILLAGE_MAP];
