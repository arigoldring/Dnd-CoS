import { createClient } from "@supabase/supabase-js";

// Importing key from .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
console.log(supabaseUrl, supabaseKey)

// Supabase client is used to interact with the database
// gives access to methods to insert, update, delete, and query data in the database
export const supabase = createClient(supabaseUrl, supabaseKey);