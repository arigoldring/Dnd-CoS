import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../services/AuthContext";
import { signInWithDemo } from "../../services/auth";
import { errorMessage } from "../../lib/errors";
import "../onboarding/onboarding.css";

/**
 * The public demo link: /#/demo signs a stranger into one shared account and
 * drops them inside one campaign, with no signup step in the way.
 *
 * The whole design rests on that last clause. A multi-use invite code would
 * have worked and was rejected for two reasons: it still puts a Google consent
 * screen between a Discord click and the app, which is where most of the
 * click-through dies, and every curious clicker who does get through becomes a
 * permanent auth.users row nobody asked for. One shared account has neither
 * cost.
 *
 * What it buys instead is a password in the JS bundle. That is not a leak to be
 * mitigated -- it is the feature, and it is why the account behind it is built
 * to be worthless: no Google identity, profiles.role left at 'player' so
 * is_dm() can never admit it, and exactly one campaign_members row, which after
 * 018 is the whole of what it can reach. Write access by that account is
 * accepted; db/fixtures/demo_campaign_reset.sql is the recovery path.
 *
 * The credentials still stay out of git. .env is gitignored, and Cloudflare
 * Pages holds its own copy for the deployed build -- so a build that has never
 * been given them renders the explanation below rather than a blank screen.
 *
 * Sits ABOVE AuthGate in App.tsx, which is structural rather than incidental:
 * signing in is what this route does, so it is the one route a signed-out
 * visitor has to be able to reach. Everything else stays gated.
 */
export function Demo() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // Bumped by the retry button, and in the effect's deps, which is the only
  // reason retrying does anything: clearing `error` alone re-renders without
  // re-running the effect, so the button would have looked like it worked and
  // left the same screen up.
  const [attempt, setAttempt] = useState(0);

  // StrictMode runs this effect twice on mount, and signing in twice would fire
  // two password grants and two navigations for one click. The ref is what makes
  // the attempt happen once per `attempt`; it is reset on failure so the next
  // bump gets through.
  const attempted = useRef(false);

  const email = import.meta.env.VITE_DEMO_EMAIL;
  const password = import.meta.env.VITE_DEMO_PASSWORD;
  const campaignId = import.meta.env.VITE_DEMO_CAMPAIGN_ID;

  // Someone else's session, which is the case worth stopping for: the DM
  // following their own link to check it still works. Compared on email rather
  // than id because the id is not something this build is configured with, and
  // the email already is.
  const otherSession = Boolean(user && user.email !== email);
  const blocked = otherSession && !confirmed;

  useEffect(() => {
    if (!email || !password || !campaignId) return;
    // Nothing to decide until AuthContext has read the session -- otherwise the
    // first pass sees user null and signs in over a session that was about to
    // resolve, which is exactly the silent replacement the warning below exists
    // to prevent.
    if (loading || blocked || attempted.current) return;

    // Already the demo account. Re-authenticating would work and would throw
    // away a perfectly good session to get the same one back.
    if (user && user.email === email) {
      navigate(`/campaign/${campaignId}`, { replace: true });
      return;
    }

    attempted.current = true;
    signInWithDemo(email, password)
      // replace, so Back returns to wherever they came from rather than to a
      // route that would immediately sign them in again.
      .then(() => navigate(`/campaign/${campaignId}`, { replace: true }))
      .catch((err) => {
        // Where a wrong password, an unconfirmed account or a deleted user
        // arrives. GoTrue says "Invalid login credentials" for all three, so the
        // console gets the original and the screen gets the retry.
        console.error("Problem signing in to the demo:", err);
        setError(errorMessage(err, "Problem signing in to the demo"));
        attempted.current = false;
      });
  }, [email, password, campaignId, loading, blocked, user, navigate, attempt]);

  // A build with no demo configured. Named rather than generic: the person who
  // sees this is whoever deployed it, and the fix is one variable they have not
  // set.
  if (!email || !password || !campaignId) {
    const missing = [
      !email && "VITE_DEMO_EMAIL",
      !password && "VITE_DEMO_PASSWORD",
      !campaignId && "VITE_DEMO_CAMPAIGN_ID",
    ].filter((name): name is string => Boolean(name));

    return (
      <div className="threshold threshold--narrow">
        <div className="threshold__inner">
          <p className="threshold__brand">Strahd Hub</p>
          <h1>No demo here</h1>
          <p className="threshold__blurb">
            This build has no demo account configured, so there is nothing to
            sign in to. If you deployed it, set these where the build runs — for
            Cloudflare Pages that is the dashboard, not the repo.
          </p>
          <p className="threshold__error">Missing: {missing.join(", ")}</p>
          <Link className="threshold__back" to="/">
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="threshold threshold--narrow">
        <div className="threshold__inner">
          <p className="threshold__brand">Strahd Hub</p>
          <h1>Couldn't open the demo</h1>
          <p className="threshold__error">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
          <Link className="threshold__back" to="/">
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  // The guard. Signing the DM out from under themselves without asking is the
  // one genuinely rude thing this route could do, and it is the likeliest way it
  // gets used: pasting the link into Discord means clicking it yourself first.
  if (blocked) {
    return (
      <div className="threshold threshold--narrow">
        <div className="threshold__inner">
          <p className="threshold__brand">Strahd Hub</p>
          <h1>You're already signed in</h1>
          <p className="threshold__blurb">
            You're signed in as {user?.email ?? "another account"}. Opening the
            demo signs you out and replaces that session with the shared demo
            account — you'd sign back in with Google afterwards.
          </p>
          <button onClick={() => setConfirmed(true)}>
            Continue to the demo
          </button>
          <Link className="threshold__back" to="/">
            Stay signed in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="threshold threshold--narrow">
      <div className="threshold__inner">
        <p className="threshold__brand">Strahd Hub</p>
        <h1>Entering the demo</h1>
        <p className="threshold__blurb">Signing you in…</p>
      </div>
    </div>
  );
}
