# Get ID Bot

A tiny Telegram bot that tells you the numeric ID of users, bots, groups, channels and forums.
Runs on a Cloudflare Worker (free plan is enough), no dependencies.

## Features

- Get the ID of a user, premium user, bot, group, channel or forum using Telegram's native pickers
  (including "my group / my channel / my forum"), or just forward any message.
- Languages: English, فارسی, Русский.
- Forced channel join (toggle on/off, add/remove channels from the panel).
- Admin panel (owner can add/remove admins; the panel button is hidden from normal users).
- Support: users write directly to the bot, the owner answers by replying to the message.
- Anti-spam: 4 actions within 10 seconds mutes the user for 60 s (grows on repeat). Admins are exempt.
- Privacy: no user list, no stats, no message storage. The only per-user data is a language the user
  explicitly picks with the language button.
- Light on resources: settings and join checks are cached in memory.

## Deploy (Termux or any shell with `curl` and `node`)

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Create a Cloudflare API token (Account permissions): *Workers Scripts: Edit*,
   *Workers KV Storage: Edit*, *Account Settings: Read*.
3. Find your numeric Telegram ID (for example with this bot).
4. Run:

```bash
bash deploy.sh
```

It asks for the tokens, your owner ID and a worker name, creates the KV namespace, uploads the
worker, stores `BOT_TOKEN` as a secret and `OWNER_ID` as a variable, and sets the webhook.
Nothing is written to disk. Then send `/start` to your bot.

Open your owner chat with the bot once (`/start`) so it can forward support messages to you.

## Configuration

| Name | Type | Description |
|------|------|-------------|
| `BOT_TOKEN` | secret | Telegram bot token |
| `OWNER_ID` | variable | numeric Telegram ID of the owner |
| `DB` | KV binding | stores settings (admins, forced channels, forced-join switch) and chosen languages |

Tunable constants at the top of `worker.js`: `LIMIT`, `WINDOW`, `MUTE` (anti-spam), `CFG_TTL`, `JOIN_TTL` (cache).

## Notes

- The forced-join check only works if the bot is an admin in those channels. The panel refuses to add a channel
  where the bot is not an admin or cannot create an invite link.
- Opening `/setup` is safe to repeat: it does nothing if the webhook is already set.
- Anti-spam counters and caches live in the worker's memory, so they reset when the isolate restarts, and
  under heavy parallel load a user may be counted per isolate (best-effort, not a hard guarantee).
- Never commit tokens. If one leaks, revoke it (`/revoke` in BotFather, or roll it in the Cloudflare dashboard).

## License

MIT
