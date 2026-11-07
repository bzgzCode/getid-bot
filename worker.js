// Telegram "Get ID" bot — Cloudflare Worker (webhook + KV), lightweight edition
// No secrets or IDs in this file. Config comes from the environment:
//   BOT_TOKEN (secret), OWNER_ID (numeric Telegram id of the owner), KV binding named DB.
// Stored in KV: bot settings (admins, forced channels) + a language only if the user picks one.
// No stats, no user list, no messages stored. Anti-spam and caches live in memory only.

let OWNER = 0; // set per request from env.OWNER_ID (see fetch)
const LANGS = ['en', 'fa', 'ru'];

// Anti-spam: LIMIT actions inside WINDOW ms => muted for MUTE ms (x strikes, max x10)
const LIMIT = 4, WINDOW = 10000, MUTE = 60000;
const CFG_TTL = 60000;     // settings cache
const JOIN_TTL = 600000;   // "already joined" cache

const SPAM = new Map(), LANGC = new Map(), JOINED = new Map();
let CFG = null, CFG_AT = 0;

const T = {
  en: {
    name: '🇬🇧 English',
    user: '👤 User', premium: '⭐ Premium', bot: '👽 Bot',
    group: '👥 Group', channel: '📢 Channel', forum: '💬 Forum',
    mygroup: '👥 My Group', mychannel: '📢 My Channel', myforum: '💬 My Forum',
    admin: '⚙️ Admin panel', lang: '🌐 Language', support: '🆘 Support',
    hello: 'Use the buttons below to get the ID of a user, bot, group, channel or forum. You can also forward any message to me.',
    first: 'First', language: 'Lang', id: 'Id',
    pickLang: 'Choose your language:', langSet: '✅ Language changed.',
    joinMsg: '🔒 To use the bot, please join the channels below, then press “✅ Joined”.',
    joined: '✅ Joined', notJoined: '❌ You have not joined all channels yet.',
    rUser: '👤 User', rBot: '👽 Bot', rGroup: '👥 Group', rChannel: '📢 Channel', rForum: '💬 Forum', rPremium: '⭐ Premium user',
    title: 'Title', username: 'Username',
    supportInfo: '🆘 <b>Support</b>\nJust type your message here (text, photo, voice, file…). It goes straight to the admin and the answer will arrive here.',
    supportSent: '✅ Your message was sent to the admin.',
    spam: (s) => `⏳ Too many requests. Please wait ${s} seconds.`,
    panel: (o, f, c, a) => `⚙️ <b>Admin panel</b>\n\n👑 Owner: <code>${o}</code>\n🔒 Forced join: <b>${f ? 'ON' : 'OFF'}</b>\n📢 Forced channels: <b>${c}</b>\n👮 Admins: <b>${a}</b>`,
    forceOn: '🔒 Forced join: ON ✅', forceOff: '🔓 Forced join: OFF ❌',
    channels: '📢 Forced channels', admins: '👮 Admins', add: '➕ Add', back: '🔙 Back', cancel: '✖️ Cancel',
    chTitle: '📢 <b>Forced channels</b>\nTap a channel to remove it.', adTitle: '👮 <b>Admins</b>\nTap an admin to remove.',
    emptyCh: '— no channels —', emptyAd: '— no extra admins —',
    askAdmin: 'Send the numeric ID of the new admin (or forward a message from them).',
    askCh: 'Send the channel @username or numeric ID. The bot must be an admin there.',
    done: '✅ Done.', bad: '❌ Invalid input.', onlyOwner: '⛔ Owner only.',
    chFail: '❌ Could not access that channel. Make the bot admin there first.',
  },
  fa: {
    name: '🇮🇷 فارسی',
    user: '👤 کاربر', premium: '⭐ پریمیوم', bot: '👽 ربات',
    group: '👥 گروه', channel: '📢 کانال', forum: '💬 فروم',
    mygroup: '👥 گروه من', mychannel: '📢 کانال من', myforum: '💬 فروم من',
    admin: '⚙️ پنل ادمین', lang: '🌐 زبان', support: '🆘 پشتیبانی',
    hello: 'با دکمه‌های پایین آیدی کاربر، ربات، گروه، کانال یا فروم را بگیرید. می‌توانید هر پیامی را هم فوروارد کنید.',
    first: 'نام', language: 'زبان', id: 'آیدی',
    pickLang: 'زبان خود را انتخاب کنید:', langSet: '✅ زبان تغییر کرد.',
    joinMsg: '🔒 برای استفاده از ربات ابتدا در کانال‌های زیر عضو شوید و سپس «✅ عضو شدم» را بزنید.',
    joined: '✅ عضو شدم', notJoined: '❌ هنوز در همه کانال‌ها عضو نشده‌اید.',
    rUser: '👤 کاربر', rBot: '👽 ربات', rGroup: '👥 گروه', rChannel: '📢 کانال', rForum: '💬 فروم', rPremium: '⭐ کاربر پریمیوم',
    title: 'عنوان', username: 'یوزرنیم',
    supportInfo: '🆘 <b>پشتیبانی</b>\nپیامتان را همین‌جا بنویسید (متن، عکس، ویس، فایل…). مستقیم برای ادمین ارسال می‌شود و پاسخ همین‌جا می‌آید.',
    supportSent: '✅ پیام شما برای ادمین ارسال شد.',
    spam: (s) => `⏳ درخواست‌های زیاد. لطفاً ${s} ثانیه صبر کنید.`,
    panel: (o, f, c, a) => `⚙️ <b>پنل ادمین</b>\n\n👑 مالک: <code>${o}</code>\n🔒 جوین اجباری: <b>${f ? 'روشن' : 'خاموش'}</b>\n📢 کانال‌های اجباری: <b>${c}</b>\n👮 ادمین‌ها: <b>${a}</b>`,
    forceOn: '🔒 جوین اجباری: روشن ✅', forceOff: '🔓 جوین اجباری: خاموش ❌',
    channels: '📢 کانال‌های اجباری', admins: '👮 ادمین‌ها', add: '➕ افزودن', back: '🔙 بازگشت', cancel: '✖️ لغو',
    chTitle: '📢 <b>کانال‌های اجباری</b>\nبرای حذف روی کانال بزنید.', adTitle: '👮 <b>ادمین‌ها</b>\nبرای حذف روی ادمین بزنید.',
    emptyCh: '— کانالی نیست —', emptyAd: '— ادمین اضافه‌ای نیست —',
    askAdmin: 'آیدی عددی ادمین جدید را بفرستید (یا یک پیام از او فوروارد کنید).',
    askCh: 'یوزرنیم (@) یا آیدی عددی کانال را بفرستید. ربات باید در آن کانال ادمین باشد.',
    done: '✅ انجام شد.', bad: '❌ ورودی نامعتبر.', onlyOwner: '⛔ فقط مالک.',
    chFail: '❌ دسترسی به کانال ممکن نیست. ابتدا ربات را در آن ادمین کنید.',
  },
  ru: {
    name: '🇷🇺 Русский',
    user: '👤 Пользователь', premium: '⭐ Premium', bot: '👽 Бот',
    group: '👥 Группа', channel: '📢 Канал', forum: '💬 Форум',
    mygroup: '👥 Моя группа', mychannel: '📢 Мой канал', myforum: '💬 Мой форум',
    admin: '⚙️ Панель админа', lang: '🌐 Язык', support: '🆘 Поддержка',
    hello: 'Кнопками ниже получите ID пользователя, бота, группы, канала или форума. Можно также переслать любое сообщение.',
    first: 'Имя', language: 'Язык', id: 'Id',
    pickLang: 'Выберите язык:', langSet: '✅ Язык изменён.',
    joinMsg: '🔒 Чтобы пользоваться ботом, подпишитесь на каналы ниже и нажмите «✅ Я подписался».',
    joined: '✅ Я подписался', notJoined: '❌ Вы ещё не подписались на все каналы.',
    rUser: '👤 Пользователь', rBot: '👽 Бот', rGroup: '👥 Группа', rChannel: '📢 Канал', rForum: '💬 Форум', rPremium: '⭐ Premium-пользователь',
    title: 'Название', username: 'Юзернейм',
    supportInfo: '🆘 <b>Поддержка</b>\nПросто напишите сообщение здесь (текст, фото, голосовое, файл…). Оно сразу уйдёт админу, а ответ придёт сюда.',
    supportSent: '✅ Ваше сообщение отправлено админу.',
    spam: (s) => `⏳ Слишком много запросов. Подождите ${s} сек.`,
    panel: (o, f, c, a) => `⚙️ <b>Панель админа</b>\n\n👑 Владелец: <code>${o}</code>\n🔒 Обязательная подписка: <b>${f ? 'ВКЛ' : 'ВЫКЛ'}</b>\n📢 Каналов: <b>${c}</b>\n👮 Админов: <b>${a}</b>`,
    forceOn: '🔒 Подписка: ВКЛ ✅', forceOff: '🔓 Подписка: ВЫКЛ ❌',
    channels: '📢 Обязательные каналы', admins: '👮 Админы', add: '➕ Добавить', back: '🔙 Назад', cancel: '✖️ Отмена',
    chTitle: '📢 <b>Обязательные каналы</b>\nНажмите на канал, чтобы удалить.', adTitle: '👮 <b>Админы</b>\nНажмите на админа, чтобы удалить.',
    emptyCh: '— каналов нет —', emptyAd: '— дополнительных админов нет —',
    askAdmin: 'Отправьте числовой ID нового админа (или перешлите его сообщение).',
    askCh: 'Отправьте @username или числовой ID канала. Бот должен быть там админом.',
    done: '✅ Готово.', bad: '❌ Неверный ввод.', onlyOwner: '⛔ Только владелец.',
    chFail: '❌ Нет доступа к каналу. Сначала сделайте бота админом.',
  },
};
const adminLabels = LANGS.map((l) => T[l].admin);
const langLabels = LANGS.map((l) => T[l].lang);
const supportLabels = LANGS.map((l) => T[l].support);
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const guessLang = (from) => { const lc = (from.language_code || '').slice(0, 2); return LANGS.includes(lc) ? lc : 'en'; };

async function tg(token, method, params = {}) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params),
    });
    const j = await r.json();
    if (!j.ok) console.log(method, '->', j.description);
    return j;
  } catch (e) { console.log(method, 'error:', e.message); return { ok: false }; }
}

// ---- in-memory helpers (no KV) ----
function spamCheck(uid) {
  const now = Date.now();
  let r = SPAM.get(uid);
  if (!r) { if (SPAM.size > 5000) SPAM.clear(); r = { t: [], until: 0, strikes: 0, last: 0 }; SPAM.set(uid, r); }
  if (now < r.until) return ['muted', 0];
  if (now - r.last > 600000) r.strikes = 0;
  r.last = now;
  r.t = r.t.filter((x) => now - x < WINDOW);
  r.t.push(now);
  if (r.t.length >= LIMIT) {
    r.strikes = Math.min(r.strikes + 1, 10);
    r.until = now + MUTE * r.strikes;
    r.t = [];
    return ['warn', Math.ceil((MUTE * r.strikes) / 1000)];
  }
  return ['ok', 0];
}
async function getCfg(KV) {
  const now = Date.now();
  if (CFG && now - CFG_AT < CFG_TTL) return CFG;
  const c = (await KV.get('cfg', 'json')) || {};
  c.admins = c.admins || []; c.channels = c.channels || [];
  if (c.force === undefined) c.force = true;
  CFG = c; CFG_AT = now;
  return c;
}
async function getLang(KV, uid, from) {
  let l = LANGC.get(uid);
  if (l === undefined) {
    l = (await KV.get('l:' + uid)) || '';
    if (LANGC.size > 5000) LANGC.clear();
    LANGC.set(uid, l);
  }
  return LANGS.includes(l) ? l : guessLang(from);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const token = env.BOT_TOKEN;
    OWNER = Number(env.OWNER_ID) || 0;
    if (!token || !OWNER) return new Response('BOT_TOKEN secret and OWNER_ID variable are required.', { status: 500 });
    const secret = (token.split(':')[1] || '').slice(0, 40);

    if (url.pathname === '/setup') {
      if (!env.DB) return new Response('KV namespace is not bound. Add a KV binding named DB.', { status: 500 });
      const r = await tg(token, 'setWebhook', {
        url: url.origin + '/webhook', secret_token: secret,
        allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
      });
      return new Response(JSON.stringify(r, null, 2), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return new Response('forbidden', { status: 403 });
      const update = await req.json();
      ctx.waitUntil(handle(token, env.DB, update).catch((e) => console.log('handler error', e)));
      return new Response('ok');
    }
    return new Response('OK');
  },
};

async function handle(token, KV, update) {
  const api = (m, p) => tg(token, m, p);
  const send = (chat_id, text, extra = {}) => api('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

  const msg = update.message, cq = update.callback_query;
  const from = msg ? msg.from : cq && cq.from;
  if (!from || from.is_bot) return;
  if (msg && msg.chat.type !== 'private') return;
  const uid = from.id;

  const cfg = await getCfg(KV);
  const saveCfg = async () => { await KV.put('cfg', JSON.stringify(cfg)); CFG = cfg; CFG_AT = Date.now(); JOINED.clear(); };
  const isAdm = uid === OWNER || cfg.admins.includes(uid);

  // ---- anti-spam (admins exempt). Muted users cost nothing: no KV, no API calls ----
  if (!isAdm) {
    const [st, secs] = spamCheck(uid);
    if (st !== 'ok') {
      if (cq) await api('answerCallbackQuery', { callback_query_id: cq.id });
      if (st === 'warn') await send(uid, T[guessLang(from)].spam(secs));
      return;
    }
  }

  let lang = await getLang(KV, uid, from);
  const t = T[lang];

  const setPending = (v) => KV.put('p:' + uid, v, { expirationTtl: 600 });
  const getPending = () => KV.get('p:' + uid);
  const clearPending = () => KV.delete('p:' + uid);

  // ----- keyboards -----
  function mainKb(tt = t) {
    const u = (id, extra = {}) => ({ request_id: id, max_quantity: 1, ...extra });
    const c = (id, extra = {}) => ({ request_id: id, request_title: true, request_username: true, ...extra });
    const rows = [
      [
        { text: tt.user, request_users: u(1, { user_is_bot: false }) },
        { text: tt.premium, request_users: u(2, { user_is_bot: false, user_is_premium: true }) },
        { text: tt.bot, request_users: u(3, { user_is_bot: true }) },
      ],
      [
        { text: tt.group, request_chat: c(4, { chat_is_channel: false }) },
        { text: tt.channel, request_chat: c(5, { chat_is_channel: true }) },
        { text: tt.forum, request_chat: c(6, { chat_is_channel: false, chat_is_forum: true }) },
      ],
      [
        { text: tt.mygroup, request_chat: c(7, { chat_is_channel: false, chat_is_created: true }) },
        { text: tt.mychannel, request_chat: c(8, { chat_is_channel: true, chat_is_created: true }) },
        { text: tt.myforum, request_chat: c(9, { chat_is_channel: false, chat_is_forum: true, chat_is_created: true }) },
      ],
      [{ text: tt.lang }, { text: tt.support }],
    ];
    if (isAdm) rows[3].push({ text: tt.admin }); // admins only
    return { keyboard: rows, resize_keyboard: true };
  }
  const panelText = () => t.panel(OWNER, cfg.force, cfg.channels.length, cfg.admins.length);
  function panelKb() {
    const rows = [
      [{ text: cfg.force ? t.forceOn : t.forceOff, callback_data: 'adm:toggle' }],
      [{ text: t.channels, callback_data: 'adm:chs' }],
    ];
    if (uid === OWNER) rows.push([{ text: t.admins, callback_data: 'adm:ads' }]); // add/remove admins: owner only
    return { inline_keyboard: rows };
  }
  const cancelKb = (to) => ({ inline_keyboard: [[{ text: t.cancel, callback_data: to }]] });
  const langKb = () => ({ inline_keyboard: LANGS.map((l) => [{ text: T[l].name, callback_data: 'lang:' + l }]) });

  // ----- helpers -----
  const infoText = () => [
    from.username ? `@${esc(from.username)}` : '—',
    `${t.id}: <code>${uid}</code>`,
    `${t.first}: ${esc(from.first_name || '')}`,
    `${t.language}: ${esc(from.language_code || '-')}`,
  ].join('\n') + '\n\n' + t.hello;

  // membership check is cached in memory for 10 min per user (admins skip it)
  async function notJoinedList(force) {
    if (isAdm || !cfg.force || !cfg.channels.length) return [];
    if (!force && (JOINED.get(uid) || 0) > Date.now()) return [];
    const rs = await Promise.all(cfg.channels.map((ch) => api('getChatMember', { chat_id: ch.id, user_id: uid })));
    const res = cfg.channels.filter((ch, i) => rs[i].ok && ['left', 'kicked'].includes(rs[i].result.status));
    if (!res.length) { if (JOINED.size > 5000) JOINED.clear(); JOINED.set(uid, Date.now() + JOIN_TTL); }
    return res;
  }
  async function sendJoin(list) {
    const rows = list.filter((c) => c.link).map((c) => [{ text: '📢 ' + c.title, url: c.link }]);
    rows.push([{ text: t.joined, callback_data: 'check' }]);
    await send(uid, t.joinMsg, { reply_markup: { inline_keyboard: rows } });
  }
  function fmtShared(rid, obj) {
    if (obj.users) {
      const label = rid === 2 ? t.rPremium : rid === 3 ? t.rBot : t.rUser;
      return obj.users.map((u) => `${label}\n${t.id}: <code>${u.user_id}</code>` +
        (u.username ? `\n${t.username}: @${esc(u.username)}` : '') +
        (u.first_name ? `\n${t.first}: ${esc(u.first_name)}` : '')).join('\n\n');
    }
    const label = [5, 8].includes(rid) ? t.rChannel : [6, 9].includes(rid) ? t.rForum : t.rGroup;
    return `${label}\n${t.id}: <code>${obj.chat_id}</code>` +
      (obj.title ? `\n${t.title}: ${esc(obj.title)}` : '') +
      (obj.username ? `\n${t.username}: @${esc(obj.username)}` : '');
  }

  // user -> owner. Nothing is stored: the user's id travels inside the message header (#U<id>)
  async function relaySupport(m) {
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
    const head = `📨 #U${uid}\n👤 ${esc(name)}${from.username ? ' @' + esc(from.username) : ''}\n↩️ Reply to this message to answer`;
    let ok = false;
    if (m.text) {
      ok = (await send(OWNER, head + '\n\n' + esc(m.text.slice(0, 3500)))).ok;
    } else if (m.photo || m.video || m.document || m.audio || m.voice || m.animation) {
      const cap = head + (m.caption ? '\n\n' + esc(m.caption.slice(0, 600)) : '');
      ok = (await api('copyMessage', { chat_id: OWNER, from_chat_id: uid, message_id: m.message_id, caption: cap, parse_mode: 'HTML' })).ok;
    } else if (m.sticker || m.video_note || m.contact || m.location) {
      const h = await send(OWNER, head);
      if (h.ok) ok = (await api('copyMessage', { chat_id: OWNER, from_chat_id: uid, message_id: m.message_id, reply_to_message_id: h.result.message_id })).ok;
    } else return;
    if (ok) await send(uid, t.supportSent);
  }

  // ================= MESSAGE =================
  if (msg) {
    const text = msg.text || '';

    // owner replies to a support message -> goes back to that user
    if (uid === OWNER && msg.reply_to_message && !text.startsWith('/')) {
      const rm = msg.reply_to_message;
      const mm = rm.from && rm.from.is_bot && /#U(\d+)/.exec(rm.text || rm.caption || '');
      if (mm) {
        const r = await api('copyMessage', { chat_id: Number(mm[1]), from_chat_id: uid, message_id: msg.message_id });
        return send(uid, r.ok ? '✅ Sent' : '❌ Not sent (did the user block the bot?)');
      }
    }

    // admin text input (add channel / add admin) — KV read only for admins
    if (isAdm && !text.startsWith('/') && text && !langLabels.includes(text) && !adminLabels.includes(text) && !supportLabels.includes(text)) {
      const p = await getPending();
      if (p) {
        await clearPending();
        if (p === 'addadmin' && uid === OWNER) {
          const id = Number(text.trim()) || (msg.forward_origin && msg.forward_origin.sender_user && msg.forward_origin.sender_user.id);
          if (!id || id <= 0) return send(uid, t.bad);
          if (id !== OWNER && !cfg.admins.includes(id)) cfg.admins.push(id);
          await saveCfg();
          return send(uid, t.done + '\n\n' + panelText(), { reply_markup: panelKb() });
        }
        if (p === 'addch') {
          const input = text.trim();
          const chat = await api('getChat', { chat_id: /^-?\d+$/.test(input) ? Number(input) : input.replace(/^https?:\/\/t\.me\//, '@') });
          if (!chat.ok) return send(uid, t.chFail);
          const c = chat.result;
          let link = c.username ? `https://t.me/${c.username}` : null;
          if (!link) { const l = await api('exportChatInviteLink', { chat_id: c.id }); if (l.ok) link = l.result; }
          if (!cfg.channels.find((x) => x.id === c.id)) cfg.channels.push({ id: c.id, title: c.title || c.username, link });
          await saveCfg();
          return send(uid, t.done + '\n\n' + panelText(), { reply_markup: panelKb() });
        }
      }
    }

    const nj = await notJoinedList(false);
    if (nj.length) return sendJoin(nj);

    if (msg.users_shared) return send(uid, fmtShared(msg.users_shared.request_id, msg.users_shared), { reply_markup: mainKb() });
    if (msg.chat_shared) return send(uid, fmtShared(msg.chat_shared.request_id, msg.chat_shared), { reply_markup: mainKb() });

    if (text.startsWith('/start')) return send(uid, infoText(), { reply_markup: mainKb() });
    if (text.startsWith('/lang') || langLabels.includes(text)) return send(uid, t.pickLang, { reply_markup: langKb() });
    if (text.startsWith('/support') || supportLabels.includes(text)) return send(uid, t.supportInfo, { reply_markup: mainKb() });
    if ((text.startsWith('/admin') || adminLabels.includes(text)) && isAdm) return send(uid, panelText(), { reply_markup: panelKb() });
    if (text.startsWith('/')) return;

    // forwarded message -> show origin id
    if (msg.forward_origin) {
      const o = msg.forward_origin;
      const id = o.sender_user ? o.sender_user.id : o.chat ? o.chat.id : null;
      if (id) return send(uid, `${t.id}: <code>${id}</code>`, { reply_markup: mainKb() });
      return;
    }

    // anything else typed to the bot = support message to the owner
    if (uid === OWNER) return send(uid, 'ℹ️ To answer a user, reply to their message.');
    return relaySupport(msg);
  }

  // ================= CALLBACK =================
  const data = cq.data || '';
  const chat_id = cq.message && cq.message.chat.id;
  const message_id = cq.message && cq.message.message_id;
  const answer = (text, alert) => api('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: !!alert });
  const edit = (text, kb) => api('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', reply_markup: kb });

  if (data.startsWith('lang:')) {
    const l = data.split(':')[1];
    if (LANGS.includes(l)) { await KV.put('l:' + uid, l); LANGC.set(uid, l); lang = l; }
    await answer();
    await api('deleteMessage', { chat_id, message_id });
    return send(uid, T[lang].langSet, { reply_markup: mainKb(T[lang]) });
  }
  if (data === 'check') {
    const nj = await notJoinedList(true);
    if (nj.length) return answer(t.notJoined, true);
    await answer();
    await api('deleteMessage', { chat_id, message_id });
    return send(uid, infoText(), { reply_markup: mainKb() });
  }

  if (!/^(adm:|rma:|rmc:)/.test(data)) return answer();
  if (!isAdm) return answer('⛔', true);
  await answer();

  const ownerOnly = data === 'adm:ads' || data === 'adm:addadmin' || data.startsWith('rma:');
  if (ownerOnly && uid !== OWNER) return send(uid, t.onlyOwner);

  const chListView = () => ({
    text: t.chTitle + (cfg.channels.length ? '' : '\n\n' + t.emptyCh),
    kb: { inline_keyboard: [
      ...cfg.channels.map((c) => [{ text: '❌ ' + c.title, callback_data: 'rmc:' + c.id }]),
      [{ text: t.add, callback_data: 'adm:addch' }],
      [{ text: t.back, callback_data: 'adm:home' }],
    ] },
  });
  const adListView = () => ({
    text: t.adTitle + `\n\n👑 <code>${OWNER}</code>` + (cfg.admins.length ? '' : '\n' + t.emptyAd),
    kb: { inline_keyboard: [
      ...cfg.admins.map((a) => [{ text: '❌ ' + a, callback_data: 'rma:' + a }]),
      [{ text: t.add, callback_data: 'adm:addadmin' }],
      [{ text: t.back, callback_data: 'adm:home' }],
    ] },
  });

  if (data === 'adm:home') { await clearPending(); return edit(panelText(), panelKb()); }
  if (data === 'adm:toggle') { cfg.force = !cfg.force; await saveCfg(); return edit(panelText(), panelKb()); }
  if (data === 'adm:chs') { await clearPending(); const v = chListView(); return edit(v.text, v.kb); }
  if (data === 'adm:addch') { await setPending('addch'); return edit(t.askCh, cancelKb('adm:chs')); }
  if (data.startsWith('rmc:')) {
    cfg.channels = cfg.channels.filter((c) => String(c.id) !== data.slice(4));
    await saveCfg();
    const v = chListView(); return edit(v.text, v.kb);
  }
  if (data === 'adm:ads') { await clearPending(); const v = adListView(); return edit(v.text, v.kb); }
  if (data === 'adm:addadmin') { await setPending('addadmin'); return edit(t.askAdmin, cancelKb('adm:ads')); }
  if (data.startsWith('rma:')) {
    cfg.admins = cfg.admins.filter((a) => String(a) !== data.slice(4));
    await saveCfg();
    const v = adListView(); return edit(v.text, v.kb);
  }
}
