# Discord application notifications

Applications are stored in Netlify Forms. The server-side `formSubmitted` handler sends verified recruitment submissions to Discord, covering solo players, squads, and staff. Spam submissions are not forwarded. Applicants do not need to sign into Discord to submit.

## Choose the destination

1. Open your Discord server and the channel where applications should appear.
2. Open **Edit Channel → Integrations → Webhooks → New Webhook** (or choose an existing webhook). You need permission to manage webhooks.
3. Confirm the channel, then use **Copy Webhook URL**.
4. Supply it through the secure project setup prompt as `DISCORD_WEBHOOK_URL`. Keep it server-side; never paste it into HTML, browser JavaScript, or source control. If changing it later in Netlify environment settings, make it available to Functions and redeploy.

The destination is determined by the webhook's channel in Discord. An earlier channel selection elsewhere does not select it automatically. You can edit the webhook in Discord to change its destination.

## Verify after deployment

Submit a real application from the deployed site, confirm it under **Netlify → Forms → fnatic-recruitment → Verified submissions**, and check the selected Discord channel. No live test messages are sent during automated code checks.

If an application is absent, check Forms' spam list first. If it is saved but no Discord message arrives, inspect the `discord-applications` function logs and verify the webhook still exists, targets the correct channel, and has permission to send messages. An HTTP 429 means Discord is rate limiting; the handler retries short rate limits. Discord delivery failures do not remove the saved Netlify submission. Discord notifications and form acceptance are separate: a success screen confirms form acceptance, not Discord delivery.

Notifications suppress mentions and split long answers to meet Discord's embed limits. All current forms use the shared recruitment form, so one webhook covers every application path.
