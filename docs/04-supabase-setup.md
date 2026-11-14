# Supabase setup (staging and production)

Do this once per project (`afrofoot-staging`, then `afrofoot-prod`). No command line needed.

## 1. Create the tables
1. Supabase dashboard > your project > **SQL Editor** > **New query**.
2. Open `supabase/paste/part1.sql` on GitHub, copy everything, paste, **Run**. Wait for "Success".
3. Do the same with `part2.sql`, then `part3.sql`. Run them in this order, once each.
   If a part shows an error, do not run the next one; send the error text.
4. The parts are generated from `supabase/migrations/*.sql` plus `supabase/seed.sql`. When a new migration is added, regenerate them (see `supabase/paste/README`) or run the new migration file by itself.

## 2. Sample data (staging only)
Run `supabase/seed_staging_sample.sql` in the SQL Editor. It adds a sample season, six matches (two coming up, four played), and three news posts, all marked "Sample", so the home page slides and sections have something to show.
Remove it with `supabase/remove_staging_sample.sql`. **Never run the sample file on production.**

## 3. Connect the website (Vercel)
1. Supabase > **Project Settings > API**. Copy the **Project URL** and the **anon / publishable key**. (Never use the `service_role` key anywhere in the website.)
2. Vercel > project > **Settings > Environment Variables**. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon / publishable key
   Use staging values for Preview deployments and production values for Production.
3. **Deployments > Redeploy** the latest one.

## 4. Later (member area)
Enable the sign-in block for overdue fees: Supabase > **Authentication > Hooks > Custom Access Token**, choose `public.custom_access_token_hook`.
