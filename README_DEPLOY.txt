SISKA V2 — SUPABASE FINAL

Files:
  index.html
  siska-api.js
  config.js

Architecture:
  Browser -> siska-api.js -> Supabase Auth/PostgREST -> SISKA tables

This index.html:
  - has NO google.script.run
  - has NO demoEmployees/demoCall
  - has NO demo login fallback
  - loads the Supabase API before the application code
  - keeps the existing SISKA UI and PK1-PK4 rendering logic
  - validates PK2 checkbox controls before saving

Deployment:
  1. Upload all three files to the SAME production directory.
  2. Do not leave an older index.html in the production root.
  3. Deploy the production branch in Cloudflare.
  4. Hard refresh Chrome after deployment.

Do not modify/restore/migrate the Supabase data as part of this deployment.
