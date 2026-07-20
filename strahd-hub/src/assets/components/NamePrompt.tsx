import { SubmitEvent, useState } from "react";
import { setDisplayName } from "../../services/profiles";
import { useAuth } from "../../services/AuthContext";

interface NamePromptProps {
  initialName?: string;
  heading?: string;
  onSuccess?: () => void;
}

export function NamePrompt({
  initialName,
  heading = "Choose a display name:",
  onSuccess,
}: NamePromptProps) {
  const { refetchProfile } = useAuth();
  const [name, setName] = useState(initialName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      await setDisplayName(trimmed);
      await refetchProfile();
      onSuccess?.();
    } catch (err) {
      console.error("Problem setting display name:", err);
      setError(
        err instanceof Error ? err.message : "Problem setting display name",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {heading && <p>{heading}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Saving..." : "Submit"}
        </button>
      </form>
      {error && <p>{error}</p>}
    </div>
  );
}
