# Security Audit Report

## Dependency Vulnerabilities
We ran `npm audit` and found the following:

- **esbuild**: 2 High severity vulnerabilities (Missing binary integrity verification in Deno module enables remote code execution via NPM_CONFIG_REGISTRY; esbuild enables any website to send any requests to the development server and read the response).
- **vite** (indirect): Depends on vulnerable versions of esbuild.
- **@babel/core**: 1 Low severity vulnerability (Arbitrary File Read via sourceMappingURL Comment).

**Recommendation:** Run `npm audit fix` / `npm audit fix --force` and test the application, or bump `@vitejs/plugin-react` and `vite` to their latest stable non-vulnerable versions if necessary.

## Supabase Database Security (RLS)
We reviewed `supabase/schema.sql` and the migrations:

- **`profiles` table**: RLS is enabled. Users can `SELECT` and `UPDATE` their own profile where `auth.uid() = id`.
  - **Issue:** The `UPDATE` policy allows users to freely edit their entire row. This means a user could theoretically maliciously update their `plan` (e.g. from 'free' to 'pro'), `stripe_customer_id`, `plan_renews_at`, or `ltd_seat` fields if they make a direct Supabase client call bypassing the UI.
  - **Recommendation:** Add a `BEFORE UPDATE` trigger on `profiles` that prevents changes to billing columns (or reverts them to `OLD` values) unless the user has an admin role or the update comes from a trusted backend service (the service role).
- **`workspaces` and `brand_kits` tables**: RLS is correctly enabled and scoped (`auth.uid() = user_id`).
- **`stripe_events` table**: No RLS is explicitly configured in `schema.sql`.
  - **Issue:** Without RLS enabled, if the Supabase anon key is exposed, a malicious user could read or modify this table, which is meant strictly for webhook idempotency tracking.
  - **Recommendation:** Enable RLS on `stripe_events` and provide no policies, completely restricting client access. The service role webhook will still be able to insert rows.
- **`assets` storage bucket**: The bucket configuration is absent from the schema files.
  - **Issue:** Ensure that the `assets` bucket has proper RLS policies enabled in Supabase so users can only upload/read/delete assets under their own `user_id` folder (`auth.uid()::text = (storage.foldername(name))[1]`).

## Codebase Analysis
- **Injection Risks:** Searched the codebase for `dangerouslySetInnerHTML`, `innerHTML`, and `eval`. None were found in use in the application code, so there are no obvious XSS vulnerabilities from this vector.
- **Environment Variables:** The frontend correctly prefixes Supabase environment variables with `VITE_`.
- **Edge Functions:**
  - `delete-account`: Correctly handles authentication by calling `admin.auth.getUser(token)` directly, rather than trusting a user ID provided in the payload. It securely deletes the verified user via the service role client.
  - `stripe-webhook`: Verifies the Stripe webhook signature correctly before processing idempotency logic and executing updates via the service role client. This prevents fraudulent webhook events from being processed.

## Summary
The application is generally well-secured regarding user isolation and backend logic. The most critical item to fix is restricting the user's ability to update their own billing columns in the `profiles` table. Dependency vulnerabilities should also be patched.
