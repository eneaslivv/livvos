# Communications Hub — push setup

The inbox supports two delivery modes:

| Mode | Latency | Setup |
|---|---|---|
| **Poll** (default) | ~90s | Already wired. Calls `gmail-sync` + `slack-sync` from the page on a 90s interval while the tab is visible. |
| **Push** | <1s | Requires one-time setup per platform (this doc). Receives webhook events directly. |

Push and poll coexist by design — push is the fast path, poll is a safety net for missed events / cold starts.

---

## Slack Events API

**Goal**: every message in monitored channels lands in `communication_messages` within ~1s of being sent in Slack.

### One-time setup (5 min)

1. **Set the signing secret** in Supabase Edge Function secrets:
   ```
   SLACK_SIGNING_SECRET = <copy from your Slack app's "Basic Information" page → Signing Secret>
   ```
   Without this, `slack-events` rejects every request with 401.

2. **In your Slack App dashboard** → **Event Subscriptions**:
   - Enable Events: ON
   - Request URL: `https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/slack-events`
     (Slack will POST a `url_verification` challenge — our function echoes it back. The URL turns green when validated.)
   - Subscribe to bot events:
     - `message.channels` — public channels the bot is in
     - `message.groups` — private channels the bot is in
   - Save changes.

3. **Reinstall the app** to your workspace if scopes changed (Slack will prompt at the top of the page).

### How it works

- Slack POSTs every `message` event to `slack-events`.
- We validate `X-Slack-Signature` (HMAC-SHA256 with the signing secret) and reject anything older than 5 minutes (replay protection).
- We look up the workspace by `team_id`, check the channel is in `slack_monitored_channels.is_active=true`, dedupe against existing rows, and insert.
- AI classification runs in the background and updates the row via realtime.

### Verifying it works

- After setup, send a test message in a monitored channel.
- It should appear in the inbox within 1–2 seconds (vs ~90s with poll).
- Check Edge Function logs (`slack-events` slug) for any signature errors.

---

## Gmail (via Google Cloud Pub/Sub)

**Goal**: every new INBOX message lands in `communication_messages` within ~1s.

This is more involved than Slack because Google requires a Pub/Sub topic in your own GCP project as the delivery channel.

### One-time setup (15–20 min)

1. **Create a GCP project** (or reuse an existing one). Note the project ID — call it `<gcp>` below.

2. **Enable APIs** in the GCP Console:
   - Gmail API
   - Cloud Pub/Sub API

3. **Create a Pub/Sub topic**:
   ```
   gcloud pubsub topics create gmail-livv --project=<gcp>
   ```
   Or via the Console → Pub/Sub → Topics → CREATE TOPIC.

4. **Grant Gmail permission to publish** to the topic:
   ```
   gcloud pubsub topics add-iam-policy-binding gmail-livv \
     --project=<gcp> \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
   This is a fixed Google service account — it's the same string for everyone.

5. **Create a strong audience token** (any random string, e.g. `openssl rand -hex 32`) — call it `<audience-token>`.

6. **Create a push subscription** on the topic:
   ```
   gcloud pubsub subscriptions create gmail-livv-push \
     --project=<gcp> \
     --topic=gmail-livv \
     --push-endpoint="https://ngswutcpsgdgmmjnfddi.supabase.co/functions/v1/gmail-events" \
     --push-auth-token-audience="<audience-token>" \
     --ack-deadline=60
   ```
   The audience token is sent as `Authorization: Bearer <token>` on every push.

7. **Set Supabase Edge Function secrets**:
   ```
   GMAIL_PUBSUB_TOPIC          = projects/<gcp>/topics/gmail-livv
   GMAIL_PUBSUB_AUDIENCE_TOKEN = <audience-token>     # same one from step 5/6
   ```
   (`gmail-watch` uses the topic; `gmail-events` uses the audience token.)

8. **Activate push for your account**:
   - Go to Communications → Settings.
   - Click **⚡ Enable push** in the Gmail section.
   - This calls `users.watch` on every connected Gmail account in your tenant and stores the resulting `historyId` + `expiration` on `integration_tokens`.
   - You'll get a confirmation toast like "1 Gmail account(s) ahora reciben push notifications."

### Refreshing the watch (every 7 days)

Gmail watches expire after 7 days. Re-click **Enable push** in Settings to renew. A scheduled cron is on the roadmap; for now it's manual.

### Why not just push without the topic?

Gmail's API only delivers change notifications via Pub/Sub — there is no direct webhook to a public URL. The topic + push subscription is the standard pattern.

### How it works

- A new message lands in your Gmail INBOX.
- Gmail publishes a Pub/Sub message: `{ emailAddress, historyId }`.
- The push subscription POSTs the envelope to `gmail-events` with the audience token in `Authorization`.
- We decode `historyId`, look up `integration_tokens` by `gmail_email`, and call `users.history.list?startHistoryId=<lastSeen>&historyTypes=messageAdded` to get the diff.
- Each new message is fetched with `users.messages.get?format=full`, deduped, inserted, and queued for AI classification.
- We advance `gmail_history_id` so the next push picks up from there.

### Verifying it works

- Send yourself a test email.
- It should appear in the inbox within 1–2 seconds.
- If nothing arrives, check:
  - GCP Console → Pub/Sub → Subscriptions → `gmail-livv-push` → metrics for delivery attempts and ack rate.
  - Edge Function logs (`gmail-events` slug) for `unauthorized` (audience token mismatch) or `no token for <email>`.
  - The `integration_tokens` row for your Gmail account: `gmail_history_id` should advance and `gmail_watch_expiry` should be ~7 days in the future.

---

## Removing push

- **Slack**: turn off Event Subscriptions in the Slack app dashboard. The poll continues to work.
- **Gmail**: call `users.stop` on each account (no UI for this yet — `curl -X POST -H "Authorization: Bearer <access_token>" https://gmail.googleapis.com/gmail/v1/users/me/stop`). Or just delete the Pub/Sub subscription. The watch will time out in 7 days regardless.
