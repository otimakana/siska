SISKA V2 — PK3/PK4 SCHEDULE + SCHOOL HOLIDAYS

FILES
- index.html
- config.js
- siska-api.js
- SISKA_HOLIDAY_PK1_PK3_PK4_MIGRATION.sql

RULES IMPLEMENTED
1. PK3 and PK4 are available to every active employee, regardless of Guru/Tendik/Struktural category.
2. PK3 and PK4 obligations are determined only by each employee's own weekday checkboxes in their respective schedule table.
3. Unchecked weekdays are not obligations and do not enter the denominator.
4. PK3 and PK4 attendance can only be saved on checked weekdays.
5. PK1 continues to use base schedule + active date assignments (Tambah/Batal).
6. School holidays exclude the date from PK1, PK3, and PK4 obligations and scoring. Existing attendance rows are not deleted; they are excluded from calculations while the holiday is active.
7. Removing a holiday makes the normal schedule obligation effective again.
8. PK3 schedule saves identify existing rows by employee_code, avoiding duplicate inserts caused by indicator_code NULL/legacy values.
9. No PK1/PK2 business rules, employee records, or attendance rows are deleted or rewritten by this package.

IMPORTANT DATABASE STEP
Run SISKA_HOLIDAY_PK1_PK3_PK4_MIGRATION.sql once in Supabase SQL Editor before using the holiday form. The migration only creates/alters the school_holidays table and its RLS policies. It does not change attendance data.

DEPLOY
Keep the three application files together in the same root/folder. Replace the existing index.html and siska-api.js with these versions; keep config.js from your project unless your Supabase URL/key have changed. Do not expose a service_role/secret key in config.js; use the Supabase publishable/anon key.

TEST PLAN
A. Schedule PK3 for a Guru on Tuesday only. PK3 input must show an obligation on Tuesday and no obligation on other days.
B. Schedule PK4 for the same Guru on Wednesday only. PK4 input must show an obligation on Wednesday only.
C. Save attendance for a checked day. It should be included in score calculations.
D. A non-checked day must show Tidak dijadwalkan and must not enter the denominator.
E. Add a holiday on a weekday that normally has PK1/PK3/PK4 obligations. Those three PK inputs must no longer treat that date as an obligation, and its attendance rows must not contribute to scores.
F. Delete the holiday. The normal schedule becomes effective again; no attendance data is recreated automatically.

VALIDATION
- siska-api.js is checked with node --check.
- Inline JavaScript in index.html is checked separately with node --check.
- No live Supabase writes were performed during package creation.
