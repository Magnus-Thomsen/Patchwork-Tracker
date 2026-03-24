#!/bin/sh
# inject.sh — replaces placeholder tokens in index.html with real env vars at build time

set -e

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set as environment variables in Netlify."
  exit 1
fi

sed -i "s|%%SUPABASE_URL%%|$SUPABASE_URL|g" app.js
sed -i "s|%%SUPABASE_ANON_KEY%%|$SUPABASE_ANON_KEY|g" app.js

echo "✅ Credentials injected successfully."
