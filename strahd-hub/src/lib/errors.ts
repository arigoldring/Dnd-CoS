/**
 * One place that turns a caught `unknown` into something worth showing a user.
 *
 * Every catch in this app used to read
 * `err instanceof Error ? err.message : "<fallback>"`, which is wrong for the
 * errors it catches most. supabase-js only constructs a real `PostgrestError`
 * — a class that extends Error — on the `.throwOnError()` path. On the
 * `{ data, error }` path every service here uses, `error` is the response body
 * handed straight back as an object literal, `{ message, details, hint, code }`,
 * with no prototype worth speaking of. `instanceof Error` is false for it, so
 * the fallback won and the database's own account of what went wrong never left
 * the console.
 *
 * That is not theoretical: a stale PostgREST schema cache made every campaign
 * create fail with `Could not find the function public.create_campaign(...) in
 * the schema cache`, and the screen said "Problem saving campaign name" — the
 * fallback, naming the form rather than the fault. The message that would have
 * ended it in a minute was one `console.error` away and nobody had reason to
 * look.
 *
 * So the test here is the shape, not the prototype: anything carrying a string
 * `message` is something the database or the auth client is trying to say.
 * Errors thrown by this app's own code (`parse.ts`, the "may have been deleted,
 * or you may not have permission" in `campaigns.ts`) satisfy it too, and always
 * did — they are ordinary Errors, which is why the old form worked well enough
 * to hide the half that didn't.
 */

// Not `PostgrestError` imported from @supabase/supabase-js: that type describes
// the class, and the class is the case that already worked. This describes the
// object literal, which is the case that didn't — and it fits AuthError and a
// plain `new Error` at the same time, so one branch covers all three.
//
// The trailing three are optional and nullable because the sources disagree:
// PostgREST sends `hint: null` where it has nothing to say, the network-failure
// path in postgrest-js sends `hint: ""`, and an Error has no such property at
// all. All three have to read as "no hint".
interface ErrorLike {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

function isErrorLike(err: unknown): err is ErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  );
}

/**
 * The string to put in front of a user, given whatever was caught.
 *
 * `fallback` is what shows when there is nothing better — a thrown string, a
 * rejected promise with no reason, an object with a non-string message. It
 * should name what the user was doing ("Problem saving campaign name"), because
 * that is all it can honestly say.
 *
 * `hint` is appended when Postgres offers one, and it is the field most worth
 * surfacing: for a permission error (42501) it is the literal GRANT that fixes
 * the problem, and for an unknown column it is the column you probably meant.
 * `code` and `details` are deliberately left out of the string and left to the
 * console — `code` is for grepping logs, not for reading, and `details` is
 * routinely a stack trace.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (!isErrorLike(err)) return fallback;

  // Trimmed and re-checked: PostgREST's non-2xx path falls back to
  // `{ message: body }` with the raw response body, which is the empty string
  // often enough to matter. An empty message is worth less than the fallback.
  const message = err.message.trim();
  if (!message) return fallback;

  const hint = err.hint?.trim();
  return hint ? `${message} — ${hint}` : message;
}
