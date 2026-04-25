# Edge Functions — push notifications

Two functions back the "shopping day" + "acknowledged" flow:

| Function | Triggered by | What it does |
| --- | --- | --- |
| `send-shopping-reminders` | `pg_cron` daily at 07:00 + 08:00 UTC; web app on insert when `list.date = today` | Sends 🧺 *Today is a shopping day in `<List>`* to every saved subscription. Idempotent per `(list_id, today)`. |
| `ack-shopping-day` | Web app, when the user clicks **OK** on a shopping-day notification | Sends 🧺 *`<Name>` acknowledged …* to the **other** user's subscriptions. |

## One-time setup

1. **Generate VAPID keys** (any machine with Node):
   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Set Edge Function secrets** (Project Settings → Edge Functions → Secrets):
   - `VAPID_PUBLIC_KEY`  — same value goes in `VITE_VAPID_PUBLIC_KEY` for the web app
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` — e.g. `mailto:you@example.com`

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are
   provided automatically by the Supabase runtime.

3. **Add the public key to the web app** in `.env.local` and Vercel:
   ```
   VITE_VAPID_PUBLIC_KEY=<the public key>
   ```

4. **Deploy**:
   ```bash
   supabase functions deploy send-shopping-reminders
   supabase functions deploy ack-shopping-day
   ```

5. **Apply the SQL migration** `supabase/migrations/0002_push_notifications.sql`
   in the SQL editor.

6. **pg_cron + Vault secrets** — the migration registers a cron entry that
   reads two Vault secrets at run time. Create them once:
   ```sql
   select vault.create_secret(
     'https://<project-ref>.functions.supabase.co/send-shopping-reminders',
     'edge_function_url'
   );
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   Enable the `pg_cron` and `pg_net` extensions in Database → Extensions if
   they aren't already on.

## Local testing

The `send-shopping-reminders` function is safe to invoke manually:

```bash
supabase functions invoke send-shopping-reminders \
  --header "Authorization: Bearer <service-role-key>" \
  --body '{}'
```

To force-fire for a specific list (skips the `date = today` filter):
```bash
… --body '{"listId":"<uuid>"}'
```
