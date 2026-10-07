SISKA V2 UI V6 — Netlify

Files:
- index.html = frontend UI V6
- siska-api.js = API V5 (dashboard fast + cache + pagination + PK4 calendar fix)
- config.example.js = contoh konfigurasi Supabase

Deployment:
1. Rename/copy index.html as your current index.html.
2. Replace current siska-api.js with the included siska-api.js.
3. Keep your existing config.js with SUPABASE_URL and SUPABASE_ANON_KEY.
4. Deploy to Netlify.
5. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R).

UI changes:
- status Hadir consistently green.
- Sakit amber, Izin blue, Tidak Hadir/Tanpa Keterangan red.
- hover/focus states improved for buttons, navigation, tables and status inputs.
- search rendering debounced.
- loading overlay delayed 160ms to avoid flicker.
- Netlify frontend uses SISKA_API/Supabase directly and restores Supabase session.
- initial master/dashboard reads are parallelized.
- explanatory UI copy shortened.
