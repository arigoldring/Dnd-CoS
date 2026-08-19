import { createContext, ReactNode, useContext, useState } from "react";

/**
 * Whether the DM is looking at this campaign as a player would see it.
 *
 * A convenience for the DM — a glance before a session to check nothing is
 * revealed that shouldn't be. It hides content the DM is fully entitled to; it
 * does not test, prove or stand in for the reveal gating, which is RLS's job
 * and unchanged by any of this.
 *
 * Plain state on purpose: not a URL param, not localStorage. A refresh or a
 * change of campaign drops it, which is the intended behaviour rather than a
 * limitation of it — preview is somewhere you look, not somewhere you can be
 * left standing without noticing.
 *
 * Deliberately not folded into useCampaign(): the campaign is what the server
 * said, this is what the viewer asked to be shown, and the one boolean must
 * never come to look like part of the other.
 */
interface PlayerPreviewContextType {
  previewing: boolean;
  setPreviewing: (previewing: boolean) => void;
}

const PlayerPreviewContext = createContext<
  PlayerPreviewContextType | undefined
>(undefined);

export function usePlayerPreview() {
  const context = useContext(PlayerPreviewContext);
  if (context === undefined) {
    throw new Error(
      "usePlayerPreview must be used within a PlayerPreviewProvider",
    );
  }
  return context;
}

export function PlayerPreviewProvider({ children }: { children: ReactNode }) {
  const [previewing, setPreviewing] = useState(false);
  const value = { previewing, setPreviewing };
  return (
    <PlayerPreviewContext.Provider value={value}>
      {children}
    </PlayerPreviewContext.Provider>
  );
}
