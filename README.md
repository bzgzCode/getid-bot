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

## راهنمای نصب فارسی

### پیش‌نیازها

- یک ربات تلگرام بسازید و توکنش را از [@BotFather](https://t.me/BotFather) بگیرید.
- در Cloudflare یک API Token بسازید که دسترسی‌های حسابی `Workers Scripts: Edit`،
  `Workers KV Storage: Edit` و `Account Settings: Read` را داشته باشد.
- برای شناسه عددی مالک، از رباتی که آیدی را نشان می‌دهد استفاده کنید؛ شناسه باید فقط عدد باشد.
- محیط اجرا باید `bash`، `curl` و `node` داشته باشد. در Termux می‌توانید این ابزارها را نصب کنید:

```bash
pkg update
pkg install bash curl nodejs
```

### نصب و راه‌اندازی

1. مخزن را دانلود یا کلون کنید و وارد پوشه پروژه شوید.
2. اسکریپت نصب را اجرا کنید:

```bash
bash deploy.sh
```

3. در پاسخ به درخواست‌ها، Cloudflare API Token، توکن ربات، شناسه عددی مالک و نام Worker را وارد کنید.
   هنگام وارد کردن توکن‌ها، ورودی مخفی است. اسکریپت KV را می‌سازد، Worker را بارگذاری می‌کند و webhook را تنظیم می‌کند.
4. در تلگرام به ربات پیام `/start` بدهید. مالک هم باید یک‌بار `/start` بزند تا ربات بتواند پیام‌های پشتیبانی را برای او بفرستد.
5. برای فعال‌کردن جوین اجباری، ربات را در کانال موردنظر ادمین کنید و از پنل ادمین کانال را اضافه کنید.

### تنظیمات و عیب‌یابی

- `BOT_TOKEN` باید توکن معتبر BotFather و `OWNER_ID` آیدی عددی مالک باشد.
- Worker باید به KV با نام binding برابر `DB` دسترسی داشته باشد؛ اسکریپت نصب آن را تنظیم می‌کند.
- اگر جوین اجباری کار نمی‌کند، بررسی کنید ربات در کانال ادمین باشد و مجوز دیدن عضویت‌ها را داشته باشد.
- اگر اسکریپت نتوانست زیردامنه `workers.dev` را پیدا کند، ابتدا آن را در بخش Workers & Pages داشبورد Cloudflare ایجاد کنید و سپس webhook را تنظیم کنید.
- در صورت افشای هرکدام از توکن‌ها، آن را فوراً باطل و جایگزین کنید.

## Configuration

| Name | Type | Description |
|------|------|-------------|
| `BOT_TOKEN` | secret | Telegram bot token |
| `OWNER_ID` | variable | numeric Telegram ID of the owner |
| `DB` | KV binding | stores settings (admins, forced channels, forced-join switch) and chosen languages |

Tunable constants at the top of `worker.js`: `LIMIT`, `WINDOW`, `MUTE`, `CFG_TTL`, `JOIN_TTL` (cache).

## Notes

- The forced-join check only works if the bot is an admin in those channels.
- Anti-spam counters and caches live in the worker's memory, so they reset when the isolate restarts.
- The current `/setup` endpoint is not separately authenticated. Do not treat it as a secure administrative endpoint; it can reset the Telegram webhook and discard pending updates. This should be fixed in the Worker before relying on the bot in production.
- The current membership check does not fail closed when Telegram's membership lookup errors, and it does not explicitly handle `restricted` members with `is_member: false`. Verify membership behavior before relying on forced join as an access control.
- Never commit tokens. If one leaks, revoke it (`/revoke` in BotFather, or roll it in the Cloudflare dashboard).

## License

MIT
