/// <reference types="vite/client" />

// The public demo login (/demo). Every one is optional, and that is the point:
// a build that was never given them has to compile, because the missing-config
// screen in Demo.tsx is what it renders. Typed here so `!email` narrows instead
// of testing Vite's `any` index signature.
//
// Not declared: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Those reach
// lib/supabase.ts through an `as string` cast on the index signature, and there
// is no build in which their absence is a state worth rendering.
interface ImportMetaEnv {
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
  readonly VITE_DEMO_CAMPAIGN_ID?: string;
}
