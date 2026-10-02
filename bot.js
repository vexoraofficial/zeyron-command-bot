/* ==========================================================
   ZEYRON COMMAND — BOT TELEGRAM v9.0 ULTIMATE
   File: bot.js
   
   UPGRADE dari v8.0:
   • Fix bug notif (escaping + fallback + status return)
   • Fix /bugtest (kasih status real, bukan "berhasil" palsu)
   • Tambah /bugsetup (test & verify notifikasi)
   • Tambah /setbugchat (ganti chat notif dynamically)
   • Tambah /bugdebug (debug payload + notif)
   • Better Markdown escaping
   • Better error handling di semua command
   • Graceful shutdown
   • Health check improvement
   • Semua fitur v8.0 tetap ada 100%
   ========================================================== */

/* ========== DOTENV (local dev — optional) ========== */
try { require('dotenv').config(); } catch (e) { /* optional */ }

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const cors = require('cors');
const crypto = require('crypto');

/* ==========================================================
   CONFIG
   ========================================================== */
const CONFIG = {
    /* BOT */
    BOT_TOKEN: process.env.BOT_TOKEN || '8929798096:AAFrynjFbR9ejXt_N2kvnGSe4xv5sNbCXb8',
    OWNER_ID: parseInt(process.env.OWNER_ID || '8790176339'),
    ADMIN_CHAT: parseInt(process.env.ADMIN_CHAT || '-1004425930502'),

    /* SERVER */
    PORT: process.env.PORT || 3000,
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
    VERBOSE: process.env.VERBOSE === 'true',

    /* PAYMENT */
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'demo',
    PAYMENT_API_KEY: process.env.PAYMENT_API_KEY || '',
    PAYMENT_PROJECT: process.env.PAYMENT_PROJECT || 'zeyron-command',
    PAYMENT_MERCHANT: process.env.PAYMENT_MERCHANT || 'ZEYRON COMMAND',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'zeyron_secret_2026',

    /* FIREBASE */
    SERVICE_ACCOUNT_PATH: process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json',

    /* BUG EXECUTOR */
    BUG_API_KEY: process.env.BUG_API_KEY || 'zeyron_bug_secret_2026',
    BUG_NOTIF_CHAT: process.env.BUG_NOTIF_CHAT || null,
    BUG_NOTIF_ENABLED: process.env.BUG_NOTIF_ENABLED !== 'false',
    BUG_SIM_DELAY: parseInt(process.env.BUG_SIM_DELAY || '800'),
    BUG_PAYLOAD_MAX: 10000,
    BUG_RATE_LIMIT: {
        perMinute: 5,
        perHour: 30,
        cooldownMs: 3000
    }
};

/* ==========================================================
   LOGGER
   ========================================================== */
const logger = {
    info: (...args) => console.log('ℹ️', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    error: (...args) => console.error('❌', ...args),
    success: (...args) => console.log('✅', ...args),
    debug: (...args) => { if (CONFIG.VERBOSE) console.log('🔍', ...args); }
};

/* ==========================================================
   ACCOUNT TYPES
   ========================================================== */
const ACCOUNT_TYPES = {
    member: {
        id: 'member', name: 'Member Premium', prefix: 'mbr',
        needsDuration: true, minDays: 1, maxDays: 10, defaultDays: 7,
        permanent: false, loginRole: 'premium', pricePerDay: 3000
    },
    permanent: {
        id: 'permanent', name: 'Premium Permanent', prefix: 'prm',
        needsDuration: false, permanent: true, loginRole: 'premium', price: 45000
    },
    reseller: {
        id: 'reseller', name: 'Reseller', prefix: 'rsl',
        needsDuration: false, permanent: true, loginRole: 'reseller', price: 75000
    },
    admin: {
        id: 'admin', name: 'Admin', prefix: 'adm',
        needsDuration: false, permanent: true, loginRole: 'admin', price: 100000
    },
    owner: {
        id: 'owner', name: 'Owner', prefix: 'own',
        needsDuration: false, permanent: true, loginRole: 'owner', price: 250000
    },
    style: {
        id: 'style', name: 'Style', prefix: 'sty',
        needsDuration: false, permanent: true, loginRole: 'premium', price: 25000
    }
};

/* ==========================================================
   FIREBASE INIT
   ========================================================== */
let db, FieldValue, Timestamp;

try {
    let serviceAccount;
    if (process.env.FIREBASE_KEY_BASE64) {
        const json = Buffer.from(process.env.FIREBASE_KEY_BASE64, 'base64').toString('utf8');
        serviceAccount = JSON.parse(json);
        logger.info('Firebase: BASE64 from env');
    } else {
        serviceAccount = require(CONFIG.SERVICE_ACCOUNT_PATH);
        logger.info('Firebase: Local file');
    }

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    FieldValue = admin.firestore.FieldValue;
    Timestamp = admin.firestore.Timestamp;

    logger.success('Firebase Admin connected');
    console.log('📌 Project ID  :', serviceAccount.project_id);
    console.log('📌 Client Email:', serviceAccount.client_email);
} catch (e) {
    logger.error('Firebase init error:', e.message);
    process.exit(1);
}

/* ==========================================================
   TELEGRAM BOT INIT
   ========================================================== */
let bot;
try {
    bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
    logger.success('Bot Telegram connected');
} catch (e) {
    logger.error('Bot init error:', e.message);
    process.exit(1);
}

/* Handle polling errors agar bot tidak crash */
bot.on('polling_error', (err) => {
    logger.error('Polling error:', err.message);
});
bot.on('error', (err) => {
    logger.error('Bot error:', err.message);
});

/* ==========================================================
   HELPERS
   ========================================================== */
function rupiah(n) {
    return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function generateUsername(typeId) {
    const type = ACCOUNT_TYPES[typeId];
    const prefix = type ? type.prefix : 'usr';
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${random}`;
}

function generatePassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < length; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

function calculateExpiry(typeId, days) {
    const type = ACCOUNT_TYPES[typeId];
    if (!type || type.permanent) return null;
    const d = parseInt(days) || type.defaultDays || 7;
    return Timestamp.fromDate(new Date(Date.now() + d * 86400000));
}

/* ==========================================================
   🆕 FIX: ESCAPE MARKDOWN v9.0
   Escape karakter yang bikin Telegram tolak pesan
   ========================================================== */
function escapeMarkdown(str) {
    // Escape karakter khusus Markdown V1
    // Karakter: _ * ` [
    return String(str || '').replace(/[_*`\[\]]/g, '\\$&');
}

/* Escape untuk isi code block (```...```) — hanya backtick */
function escapeCodeBlock(str) {
    return String(str || '').replace(/`/g, '\'');
}

/* Escape URL untuk inline code — ganti ` jadi ' */
function escapeUrl(str) {
    return String(str || '').replace(/`/g, '\'');
}

function isValidWALink(link) {
    return /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(link) ||
           /wa\.me\/[A-Za-z0-9]+/i.test(link);
}

/* ==========================================================
   VALIDATORS
   ========================================================== */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { ok: false, error: 'Username wajib diisi' };
    }
    const u = username.trim();
    if (u.length < 3) return { ok: false, error: 'Username minimal 3 karakter' };
    if (u.length > 30) return { ok: false, error: 'Username maksimal 30 karakter' };
    if (!/^[a-zA-Z0-9_.-]+$/.test(u)) {
        return { ok: false, error: 'Username hanya boleh huruf, angka, titik, underscore, dan strip' };
    }
    if (/^[_.-]/.test(u)) {
        return { ok: false, error: 'Username tidak boleh diawali titik/underscore/strip' };
    }
    return { ok: true, value: u };
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { ok: false, error: 'Password wajib diisi' };
    }
    if (password.length < 3) return { ok: false, error: 'Password minimal 3 karakter' };
    if (password.length > 64) return { ok: false, error: 'Password maksimal 64 karakter' };
    return { ok: true, value: password };
}

function validatePayload(payload) {
    if (!payload) return { ok: true, value: '' };
    if (typeof payload !== 'string') return { ok: false, error: 'Payload harus string' };
    if (payload.length > CONFIG.BUG_PAYLOAD_MAX) {
        return { ok: false, error: `Payload terlalu besar (max ${CONFIG.BUG_PAYLOAD_MAX} chars)` };
    }
    return { ok: true, value: payload };
}

async function isUsernameTaken(username) {
    if (!username) return false;
    try {
        const userSnap = await db.collection('users').doc(username).get();
        if (userSnap.exists) return true;

        const q = await db.collection('users')
            .where('username', '==', username).limit(1).get();
        if (!q.empty) return true;

        const poolQ = await db.collection('account_pool')
            .where('username', '==', username).limit(1).get();
        if (!poolQ.empty) return true;
    } catch (e) {
        logger.warn('isUsernameTaken error:', e.message);
    }
    return false;
}

/* ==========================================================
   SECURITY — API KEY
   ========================================================== */
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.body?.apiKey;
    if (apiKey !== CONFIG.BUG_API_KEY) {
        logger.warn('Unauthorized attempt:', req.ip, req.path);
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized — API key invalid'
        });
    }
    next();
}

/* ==========================================================
   SECURITY — RATE LIMIT
   ========================================================== */
const bugRateLimitMap = new Map();

function checkBugRateLimit(identifier) {
    const now = Date.now();
    const key = String(identifier || 'anonymous').toLowerCase();

    if (!bugRateLimitMap.has(key)) {
        bugRateLimitMap.set(key, { minute: [], hour: [], last: 0 });
    }

    const data = bugRateLimitMap.get(key);

    if (now - data.last < CONFIG.BUG_RATE_LIMIT.cooldownMs) {
        const wait = Math.ceil((CONFIG.BUG_RATE_LIMIT.cooldownMs - (now - data.last)) / 1000);
        return { ok: false, error: `Tunggu ${wait}s sebelum kirim lagi`, code: 429 };
    }

    data.minute = data.minute.filter(t => now - t < 60000);
    data.hour = data.hour.filter(t => now - t < 3600000);

    if (data.minute.length >= CONFIG.BUG_RATE_LIMIT.perMinute) {
        return { ok: false, error: `Terlalu banyak (max ${CONFIG.BUG_RATE_LIMIT.perMinute}/menit)`, code: 429 };
    }
    if (data.hour.length >= CONFIG.BUG_RATE_LIMIT.perHour) {
        return { ok: false, error: `Terlalu banyak (max ${CONFIG.BUG_RATE_LIMIT.perHour}/jam)`, code: 429 };
    }

    data.minute.push(now);
    data.hour.push(now);
    data.last = now;

    return { ok: true };
}

setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    bugRateLimitMap.forEach((data, key) => {
        if (now - data.last > 3600000) {
            bugRateLimitMap.delete(key);
            cleaned++;
        }
    });
    if (cleaned > 0) logger.debug(`Rate limit cleanup: ${cleaned} entries removed`);
}, 600000);

/* ==========================================================
   CORE BUILDER — userData
   ========================================================== */
function buildUserData(params) {
    const {
        username, password, role, expires,
        typeId, typeName, days, generatedBy,
        source = 'bot_generator'
    } = params;

    const expiredVal = (expires === 'never' || !expires) ? null : expires;

    return {
        username, password, role,
        expires,
        expired: expiredVal,
        wallet: 0,
        balance: 0,
        avatar: '', email: '', phone: '',
        banned: false, banReason: '',
        createdAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
        type: typeId,
        typeName: typeName,
        days: days || null,
        generatedBy: generatedBy || 'system',
        source,
        referral: 'REF-' + String(username).slice(0, 4).toUpperCase() +
                  crypto.randomBytes(2).toString('hex').toUpperCase(),
        themes: [],
        achievements: [],
        exp: 0,
        additionalRoles: [],
        lastSeen: new Date().toISOString(),
        roleUpdatedAt: new Date().toISOString(),
        loginReady: true
    };
}

/* ==========================================================
   ACCOUNT GENERATOR
   ========================================================== */
async function generateAccount(typeId, days, generatedBy = 'system', customUser = null, customPass = null) {
    const type = ACCOUNT_TYPES[typeId];
    if (!type) throw new Error(`Tipe "${typeId}" tidak valid`);

    if (type.needsDuration) {
        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            throw new Error(`Durasi harus ${type.minDays}-${type.maxDays} hari`);
        }
    }

    let username;
    if (customUser) {
        const v = validateUsername(customUser);
        if (!v.ok) throw new Error('Username: ' + v.error);
        const taken = await isUsernameTaken(v.value);
        if (taken) throw new Error(`Username "${v.value}" sudah dipakai`);
        username = v.value;
    } else {
        let attempts = 0;
        do {
            username = generateUsername(typeId);
            attempts++;
        } while (await isUsernameTaken(username) && attempts < 10);
    }

    let password;
    if (customPass) {
        const v = validatePassword(customPass);
        if (!v.ok) throw new Error('Password: ' + v.error);
        password = v.value;
    } else {
        password = generatePassword(10);
    }

    const expiresAt = calculateExpiry(typeId, days);
    let expires = (type.permanent || !expiresAt) ? 'never'
                : expiresAt.toDate().toISOString().slice(0, 10);

    const poolData = {
        username, password,
        type: typeId,
        typeName: type.name,
        roleId: typeId,
        roleName: type.name,
        days: type.needsDuration ? parseInt(days) : null,
        permanent: type.permanent,
        expiresAt,
        status: 'available',
        generatedBy,
        generatedAt: FieldValue.serverTimestamp(),
        usedBy: null, usedAt: null, invoice: null,
        isCustom: !!(customUser || customPass)
    };

    const poolRef = await db.collection('account_pool').add(poolData);

    const userData = buildUserData({
        username, password,
        role: type.loginRole,
        expires,
        typeId,
        typeName: type.name,
        days: type.needsDuration ? parseInt(days) : null,
        generatedBy
    });

    await db.collection('users').doc(username).set(userData);

    logger.success(`Generated: ${username} | ${type.name} | role=${type.loginRole} | exp=${expires}`);

    return {
        poolId: poolRef.id,
        username, password,
        role: type.loginRole,
        expires,
        type: typeId,
        typeName: type.name,
        days: type.needsDuration ? parseInt(days) : null,
        permanent: type.permanent,
        expiresAt,
        userData,
        isCustom: !!(customUser || customPass)
    };
}

/* ==========================================================
   CLAIM ACCOUNT
   ========================================================== */
async function claimAccount(roleId, telegram, invoice) {
    let typeId = roleId;
    if (roleId === 'premium_custom') typeId = 'member';
    if (roleId === 'premium_perm') typeId = 'permanent';

    const snap = await db.collection('account_pool')
        .where('type', '==', typeId)
        .where('status', '==', 'available')
        .limit(1)
        .get();

    if (!snap.empty) {
        const doc = snap.docs[0];
        const data = doc.data();

        await doc.ref.update({
            status: 'used',
            usedBy: telegram,
            usedAt: FieldValue.serverTimestamp(),
            invoice
        });

        logger.info(`Claimed: ${data.username} → ${telegram}`);

        return {
            username: data.username,
            password: data.password,
            type: data.type,
            typeName: data.typeName,
            expiresAt: data.expiresAt,
            fromPool: true
        };
    }

    logger.info(`Pool kosong [${typeId}] — auto-generate`);
    const defaultDays = typeId === 'member' ? 7 : null;
    const newAcc = await generateAccount(typeId, defaultDays, 'auto_on_demand');

    await db.collection('account_pool').doc(newAcc.poolId).update({
        status: 'used',
        usedBy: telegram,
        usedAt: FieldValue.serverTimestamp(),
        invoice
    });

    return { ...newAcc, fromPool: false };
}

/* ==========================================================
   CHECK STOCK
   ========================================================== */
async function getStock() {
    const stock = {};
    for (const [typeId, type] of Object.entries(ACCOUNT_TYPES)) {
        const snap = await db.collection('account_pool')
            .where('type', '==', typeId)
            .where('status', '==', 'available')
            .get();
        stock[typeId] = { name: type.name, available: snap.size };
    }
    return stock;
}

/* ==========================================================
   SEND ACCOUNT MESSAGE
   ========================================================== */
async function sendAccountMessage(chatId, acc, extra = {}) {
    const expText = acc.expiresAt
        ? acc.expiresAt.toDate().toLocaleString('id-ID')
        : (acc.expires === 'never' || acc.permanent ? '♾️ Permanent' : '-');

    const durText = acc.days ? `${acc.days} hari`
                  : (acc.permanent ? 'Permanent' : '-');

    const customTag = acc.isCustom ? '\n🎨 *CUSTOM* oleh owner' : '';

    let text = `✅ *AKUN SIAP LOGIN*${customTag}\n\n`;
    text += `📦 Tipe: *${escapeMarkdown(acc.typeName)}*\n`;
    text += `🎭 Role: \`${acc.role}\`\n`;
    text += `⏳ Durasi: ${durText}\n`;
    text += `📅 Expired: ${expText}\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `👤 Username: \`${acc.username}\`\n`;
    text += `🔑 Password: \`${acc.password}\`\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `💾 Pool: available ✅\n`;
    text += `🔐 Login: *index.html* siap ✅`;

    if (extra.footer) text += '\n\n' + extra.footer;

    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

/* ==========================================================
   🆕 BUG NOTIF v9.0 — FIX TOTAL
   ========================================================== */

/* Format Markdown (primary) */
function formatBugNotifMD(data) {
    const {
        source, username, bugName, bugId, category,
        target, groupName, payload, delay, severity, userAgent
    } = data;

    const now = new Date();
    const timeStr = now.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }) + ' WIB';

    const emoji = source === 'group_wa' ? '💬' : '💥';
    const title = source === 'group_wa' ? 'BUG GROUP WA' : 'BUG ' + (category || '').toUpperCase();

    /* Escape semua input user */
    const sUser = escapeMarkdown(username || 'unknown');
    const sBugName = escapeMarkdown(bugName || '-');
    const sBugId = bugId ? escapeMarkdown(bugId) : '';
    const sSeverity = severity ? String(severity).toUpperCase() : 'MEDIUM';
    const sTarget = escapeUrl(target || '-');  // URL, hanya ganti backtick
    const sGroupName = groupName ? escapeMarkdown(groupName) : '';
    const sUserAgent = userAgent ? String(userAgent).slice(0, 60).replace(/`/g, '\'') : '';

    let targetBlock = '';
    if (source === 'group_wa') {
        targetBlock = `🔗 *Link Grup:*\n\`${sTarget}\``;
        if (sGroupName) targetBlock += `\n📝 *Nama:* ${sGroupName}`;
    } else {
        targetBlock = `📱 *Nomor Target:*\n\`${sTarget}\``;
    }

    const hasPayload = payload && payload.trim().length > 0;
    const payloadLen = hasPayload ? payload.length : 0;
    // Escape backtick di code block
    const payloadEscaped = hasPayload
        ? escapeCodeBlock(payload.slice(0, 350))
        : '';
    const payloadTruncated = hasPayload && payload.length > 350;

    let msg = '';
    msg += `${emoji} *${title}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `👤 *User:* \`${sUser}\`\n`;
    msg += `🎯 *Bug:* ${sBugName}\n`;
    if (sBugId) msg += `🔖 *ID:* \`${sBugId}\`\n`;
    msg += `⚠️ *Severity:* ${sSeverity}\n`;
    if (delay) msg += `⏱️ *Delay:* ${delay}ms\n`;
    msg += `\n${targetBlock}\n\n`;
    msg += `🕐 *Waktu:* ${timeStr}\n\n`;

    if (hasPayload) {
        msg += `📦 *PAYLOAD* (${payloadLen} chars):\n`;
        msg += `\`\`\`\n${payloadEscaped}${payloadTruncated ? '\n... [truncated]' : ''}\n\`\`\`\n`;
        msg += `\n✅ *Status:* SIAP DIEKSEKUSI\n`;
    } else {
        msg += `📦 *PAYLOAD:* ❌ KOSONG\n`;
        msg += `\n⚠️ *Status:* PAYLOAD KOSONG\n`;
    }

    if (sUserAgent) {
        msg += `\n🌐 *Client:* \`${sUserAgent}\``;
    }

    return msg;
}

/* Format Plain Text (fallback) */
function formatBugNotifPlain(data) {
    const {
        source, username, bugName, bugId, category,
        target, groupName, payload, delay, severity
    } = data;

    const now = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour12: false
    });

    const isGroup = source === 'group_wa';
    const hasPayload = payload && payload.trim().length > 0;
    const payloadPreview = hasPayload
        ? payload.slice(0, 200) + (payload.length > 200 ? '...' : '')
        : '(kosong)';

    let text = '';
    text += `${isGroup ? '💬' : '💥'} BUG ${isGroup ? 'GROUP WA' : (category || '').toUpperCase()}\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `User     : ${username || 'unknown'}\n`;
    text += `Bug      : ${bugName || '-'}\n`;
    if (bugId) text += `ID       : ${bugId}\n`;
    text += `Severity : ${severity || 'medium'}\n`;
    if (delay) text += `Delay    : ${delay}ms\n`;
    text += `\n`;
    if (isGroup) {
        text += `Link     : ${target}\n`;
        if (groupName) text += `Grup     : ${groupName}\n`;
    } else {
        text += `Target   : ${target}\n`;
    }
    text += `\n`;
    text += `Waktu    : ${now} WIB\n`;
    text += `\n`;
    text += `PAYLOAD (${hasPayload ? payload.length : 0} chars):\n`;
    text += `${payloadPreview}\n`;
    text += `\n`;
    text += `Status   : ${hasPayload ? '✅ SIAP' : '⚠️ KOSONG'}\n`;

    return text;
}

/* ==========================================================
   🆕 SEND NOTIF v9.0 — dengan fallback + status return
   ========================================================== */
async function sendBugNotification(data) {
    /* Cek enabled */
    if (!CONFIG.BUG_NOTIF_ENABLED) {
        logger.debug('Notif disabled by config');
        return { ok: false, error: 'Notif dinonaktifkan', mode: 'skipped' };
    }

    /* Cek chat ID */
    const chatId = CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT;
    if (!chatId) {
        logger.warn('BUG_NOTIF_CHAT & ADMIN_CHAT kosong');
        return { ok: false, error: 'Chat ID kosong', mode: 'error' };
    }

    /* Coba Markdown dulu */
    try {
        const mdMsg = formatBugNotifMD(data);
        const result = await bot.sendMessage(chatId, mdMsg, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        logger.success(`Notif Markdown terkirim → chat ${chatId}`);
        return { ok: true, mode: 'markdown', messageId: result.message_id };
    } catch (e) {
        logger.warn('Markdown gagal:', e.message);

        /* Fallback: Plain Text */
        try {
            const plainMsg = formatBugNotifPlain(data);
            const result = await bot.sendMessage(chatId, plainMsg, {
                disable_web_page_preview: true
            });
            logger.success(`Notif Plain terkirim → chat ${chatId}`);
            return { ok: true, mode: 'plain', messageId: result.message_id };
        } catch (e2) {
            logger.error('Plain juga gagal:', e2.message);
            return {
                ok: false,
                error: e2.message,
                mode: 'failed',
                markdownError: e.message
            };
        }
    }
}

/* ==========================================================
   LOG BUG TO FIRESTORE
   ========================================================== */
async function logBugToFirestore(data) {
    if (!db) return null;
    try {
        const ref = await db.collection('bug_logs').add({
            source: data.source || 'direct',
            username: data.username || 'unknown',
            bugName: data.bugName || '-',
            bugId: data.bugId || null,
            category: data.category || null,
            target: data.target || null,
            groupName: data.groupName || null,
            payload: data.payload || '',
            payloadLength: (data.payload || '').length,
            hasPayload: !!(data.payload && data.payload.trim()),
            delay: data.delay || 0,
            severity: data.severity || 'medium',
            status: data.status || 'sent',
            userAgent: data.userAgent || null,
            ip: data.ip || null,
            createdAt: FieldValue.serverTimestamp(),
            executedAt: null,
            executionResult: null
        });
        return ref.id;
    } catch (e) {
        logger.error('Firestore log error:', e.message);
        return null;
    }
}

/* ==========================================================
   BOT COMMANDS — USER
   ========================================================== */

bot.onText(/\/start/, (msg) => {
    const name = escapeMarkdown(msg.from.first_name || 'User');
    bot.sendMessage(msg.chat.id,
        `👑 *ZEYRON COMMAND BOT*\n\n` +
        `Selamat datang, *${name}*!\n\n` +
        `📋 /riwayat — Riwayat pembelian\n` +
        `⏰ /expired — Cek masa aktif akun\n` +
        `🏆 /leaderboard — Top spender\n` +
        `📱 /download — Download APK\n` +
        `📞 /support — Hubungi admin\n` +
        `❓ /help — Bantuan lengkap`,
        { parse_mode: 'Markdown' }
    ).catch(e => logger.error('/start error:', e.message));
});

bot.onText(/\/help/, (msg) => {
    const isOwner = msg.from.id === CONFIG.OWNER_ID;
    let text = `📖 *BANTUAN ZEYRON COMMAND*\n\n`;
    text += `*User:*\n`;
    text += `• /start — Menu utama\n`;
    text += `• /riwayat — Riwayat pembelian\n`;
    text += `• /expired — Cek masa aktif\n`;
    text += `• /leaderboard — Top pembeli\n`;
    text += `• /download — Download APK\n`;
    text += `• /support — Chat admin\n`;

    if (isOwner) {
        text += `\n*👑 Admin Commands:*\n`;
        text += `• /roles — List tipe akun\n`;
        text += `• \`/generate <type> [hari] [user] [pass]\`\n`;
        text += `• \`/bulk <n> <type> [hari]\`\n`;
        text += `• /stock — Cek stok\n`;
        text += `• /accounts [type] — List akun\n`;
        text += `• /checkuser <username>\n`;
        text += `• /testlogin <user> <pass>\n`;
        text += `• /fixuser <username>\n`;
        text += `• /syncusers — Fix semua akun lama\n`;
        text += `• /deleteaccount <username>\n`;
        text += `• /clearused — Clear akun terpakai\n`;
        text += `• /migratepool — Migrate pool ke users\n`;
        text += `• /stats — Statistik\n`;
        text += `• /diag — Diagnostik Firebase\n`;
        text += `• /broadcast <pesan>\n`;
        text += `\n*🐛 Bug Commands:*\n`;
        text += `• /bugstats — Statistik bug\n`;
        text += `• /bugrecent — Bug terakhir\n`;
        text += `• /bugnotif [on/off] — Toggle notif\n`;
        text += `• /bugtest — Test notif bug\n`;
        text += `• /bugsetup — Verify setup notif\n`;
        text += `• /setbugchat <id> — Ganti chat notif\n`;
        text += `• /bugdebug — Debug payload & notif\n`;
        text += `• /bughelp — Bantuan bug\n`;
    }

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
        .catch(e => logger.error('/help error:', e.message));
});

bot.onText(/\/roles/, (msg) => {
    let text = `📋 *TIPE AKUN*\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const [id, type] of Object.entries(ACCOUNT_TYPES)) {
        text += `*${type.name}*\n`;
        text += `   ID: \`${id}\`\n`;
        if (type.needsDuration) {
            text += `   Durasi: ${type.minDays}-${type.maxDays} hari\n`;
        } else {
            text += `   Durasi: ♾️ Permanent\n`;
        }
        if (type.pricePerDay) {
            text += `   Harga: ${rupiah(type.pricePerDay)}/hari\n`;
        } else if (type.price) {
            text += `   Harga: ${rupiah(type.price)}\n`;
        }
        text += `\n`;
    }
    text += `*Contoh:*\n`;
    text += `• \`/generate member 7\` (random)\n`;
    text += `• \`/generate member 7 userku passku\` (custom)\n`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
        .catch(e => logger.error('/roles error:', e.message));
});

bot.onText(/\/riwayat/, async (msg) => {
    const chatId = msg.chat.id;
    const tg = '@' + (msg.from.username || msg.from.id);

    try {
        bot.sendChatAction(chatId, 'typing');
        const snap = await db.collection('transactions')
            .where('telegram', '==', tg)
            .orderBy('createdAt', 'desc').limit(10).get();

        if (snap.empty) return bot.sendMessage(chatId, '📭 Belum ada transaksi');

        let t = `📚 *Riwayat Pembelian*\n━━━━━━━━━━━━━━━━━━\n\n`;
        snap.forEach((d, i) => {
            const x = d.data();
            const st = x.status === 'paid' ? '✅ LUNAS' : '⏳ PENDING';
            const date = x.createdAt
                ? new Date(x.createdAt.toDate()).toLocaleDateString('id-ID') : '-';
            t += `*${i + 1}. ${escapeMarkdown(x.invoice)}*\n`;
            t += `   ${escapeMarkdown(x.roleName)}\n   ${st} • ${rupiah(x.total)}\n   📅 ${date}\n\n`;
        });
        bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
    } catch (e) {
        logger.error('Riwayat error:', e);
        bot.sendMessage(chatId, '❌ Error: ' + e.message);
    }
});

bot.onText(/\/expired/, async (msg) => {
    const chatId = msg.chat.id;
    const tg = '@' + (msg.from.username || msg.from.id);

    try {
        bot.sendChatAction(chatId, 'typing');
        const snap = await db.collection('accounts').where('telegram', '==', tg).get();
        if (snap.empty) return bot.sendMessage(chatId, '📭 Belum ada akun');

        let t = `⏰ *Masa Aktif Akun*\n━━━━━━━━━━━━━━━━━━\n\n`;
        snap.forEach((d, i) => {
            const x = d.data();
            let exp = '♾️ Permanent';
            if (x.expiresAt) {
                const dt = x.expiresAt.toDate();
                const diff = Math.ceil((dt - new Date()) / 86400000);
                const status = diff > 0 ? `✅ ${diff} hari lagi` : `❌ EXPIRED`;
                exp = `${dt.toLocaleDateString('id-ID')} (${status})`;
            }
            t += `*${i + 1}. \`${x.username}\`*\n   Role: ${x.role}\n   ${exp}\n\n`;
        });
        bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, '❌ Error: ' + e.message);
    }
});

bot.onText(/\/leaderboard/, async (msg) => {
    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const snap = await db.collection('transactions').where('status', '==', 'paid').get();
        if (snap.empty) return bot.sendMessage(msg.chat.id, '📭 Belum ada transaksi');

        const map = {};
        snap.forEach(d => {
            const x = d.data();
            const k = x.telegram || x.username;
            map[k] = (map[k] || 0) + Number(x.total || 0);
        });

        const arr = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
        let t = `🏆 *Top Spender*\n━━━━━━━━━━━━━━━━━━\n\n`;
        arr.forEach(([u, v], i) => {
            const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            t += `${m} ${escapeMarkdown(u)}\n    💰 ${rupiah(v)}\n\n`;
        });
        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

bot.onText(/\/support/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `📞 *Hubungi Support*\n\n` +
        `👑 Owner: Jaden Hiram\n` +
        `📧 Email: vexoraofficial@gmail.com\n` +
        `📱 Telegram: +62 859-2364-8453\n` +
        `💬 WhatsApp: +62 882-0092-39791`,
        { parse_mode: 'Markdown' }
    ).catch(e => logger.error('/support error:', e.message));
});

bot.onText(/\/download/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `📱 *Download APK Zeyron Command*\n\n` +
        `🔗 MediaFire: https://www.mediafire.com/file/zeyron-command-app\n\n` +
        `⚠️ Install dari sumber terpercaya!`,
        { parse_mode: 'Markdown' }
    ).catch(e => logger.error('/download error:', e.message));
});

/* ==========================================================
   BOT COMMANDS — ADMIN
   ========================================================== */

bot.onText(/\/generate\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Hanya Developer');
    }

    const typeId = match[1].toLowerCase();
    const arg2 = match[2] || null;
    const arg3 = match[3] || null;
    const arg4 = match[4] || null;

    const type = ACCOUNT_TYPES[typeId];
    if (!type) {
        return bot.sendMessage(msg.chat.id,
            `❌ Tipe \`${typeId}\` tidak valid\n\nGunakan /roles`,
            { parse_mode: 'Markdown' }
        );
    }

    let days = null, customUser = null, customPass = null;

    if (type.needsDuration) {
        days = arg2;
        customUser = arg3;
        customPass = arg4;

        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ *${type.name}* wajib durasi ${type.minDays}-${type.maxDays} hari\n\n` +
                `• \`/generate ${typeId} 7\`\n` +
                `• \`/generate ${typeId} 7 userku passku\``,
                { parse_mode: 'Markdown' }
            );
        }
    } else {
        customUser = arg2;
        customPass = arg3;

        if (arg2 && !isNaN(parseInt(arg2)) && !arg3) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ *${type.name}* tidak butuh durasi\n\n` +
                `• \`/generate ${typeId}\`\n` +
                `• \`/generate ${typeId} userku passku\``,
                { parse_mode: 'Markdown' }
            );
        }
    }

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const acc = await generateAccount(typeId, days, 'owner_manual', customUser, customPass);
        await sendAccountMessage(msg.chat.id, acc, {
            footer: acc.isCustom ? '🎨 Akun custom berhasil dibuat!' : undefined
        });
    } catch (e) {
        logger.error('Generate error:', e);
        bot.sendMessage(msg.chat.id, `❌ *Gagal generate*\n\n${escapeMarkdown(e.message)}`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/bulk\s+(\d+)\s+(\S+)(?:\s+(\d+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const count = parseInt(match[1]);
    const typeId = match[2].toLowerCase();
    const days = match[3] || null;
    const type = ACCOUNT_TYPES[typeId];

    if (!type) return bot.sendMessage(msg.chat.id, `❌ Tipe \`${typeId}\` tidak valid`, { parse_mode: 'Markdown' });
    if (count < 1 || count > 100) return bot.sendMessage(msg.chat.id, '❌ Jumlah 1-100');

    if (type.needsDuration) {
        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ Untuk ${type.name}, durasi ${type.minDays}-${type.maxDays}\n\n` +
                `Contoh: \`/bulk 20 ${typeId} 7\``,
                { parse_mode: 'Markdown' }
            );
        }
    }

    try {
        const statusMsg = await bot.sendMessage(msg.chat.id,
            `⏳ Generating *${count}* akun ${type.name}...`,
            { parse_mode: 'Markdown' }
        );

        const accounts = [];
        for (let i = 0; i < count; i++) {
            const acc = await generateAccount(typeId, days, 'owner_bulk');
            accounts.push(acc);

            if ((i + 1) % 5 === 0 || i === count - 1) {
                try {
                    await bot.editMessageText(
                        `⏳ Progress: *${i + 1}/${count}*...`,
                        { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
        }

        if (count <= 10) {
            let t = `✅ *${count} AKUN DIBUAT*\n\n📦 Tipe: *${type.name}*\n`;
            if (days) t += `⏳ Durasi: ${days} hari\n`;
            t += `━━━━━━━━━━━━━━━━━━\n\n`;
            accounts.forEach((a, i) => {
                t += `*${i + 1}.* \`${a.username}\`\n    \`${a.password}\`\n\n`;
            });
            await bot.editMessageText(t, {
                chat_id: msg.chat.id,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            });
        } else {
            const csv = accounts.map(a =>
                `${a.username}|${a.password}|${a.type}|${days || 'permanent'}`
            ).join('\n');

            await bot.sendDocument(msg.chat.id,
                Buffer.from(csv, 'utf8'),
                { caption: `✅ ${count} akun ${type.name}` },
                { filename: `accounts_${typeId}_${Date.now()}.txt`, contentType: 'text/plain' }
            );

            await bot.editMessageText(
                `✅ *${count} akun* berhasil dibuat`,
                { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
            );
        }
    } catch (e) {
        logger.error('Bulk error:', e);
        bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
});

bot.onText(/\/stock/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const stock = await getStock();
        let t = `📦 *STOK AKUN*\n━━━━━━━━━━━━━━━━━━\n\n`;
        let total = 0;

        for (const [id, data] of Object.entries(stock)) {
            const icon = data.available > 10 ? '🟢' : data.available > 0 ? '🟡' : '🔴';
            t += `${icon} *${data.name}*\n`;
            t += `    ID: \`${id}\`\n`;
            t += `    Tersedia: *${data.available}*\n\n`;
            total += data.available;
        }
        t += `━━━━━━━━━━━━━━━━━━\n📊 Total: *${total} akun*`;
        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/accounts(?:\s+(\S+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const typeId = match[1]?.toLowerCase();

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        let q = db.collection('account_pool');
        if (typeId && ACCOUNT_TYPES[typeId]) q = q.where('type', '==', typeId);

        const snap = await q.orderBy('generatedAt', 'desc').limit(30).get();
        if (snap.empty) return bot.sendMessage(msg.chat.id, '📭 Pool kosong');

        let t = `📋 *Akun di Pool*`;
        if (typeId) t += ` (${ACCOUNT_TYPES[typeId].name})`;
        t += `\n━━━━━━━━━━━━━━━━━━\n\n`;

        snap.forEach(d => {
            const x = d.data();
            const icon = x.status === 'available' ? '🟢' : '🔴';
            t += `${icon} \`${x.username}\` — ${escapeMarkdown(x.typeName)}\n`;
        });
        t += `\n_Total: ${snap.size}_`;
        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/checkuser\s+(\S+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const username = match[1];

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const ref = db.collection('users').doc(username);
        const snap = await ref.get();

        if (!snap.exists) {
            const q = await db.collection('users').where('username', '==', username).limit(1).get();
            if (q.empty) {
                return bot.sendMessage(msg.chat.id,
                    `❌ *Akun TIDAK ADA*\n\n\`${username}\` tidak ditemukan`,
                    { parse_mode: 'Markdown' }
                );
            }
        }

        const data = (snap.exists ? snap.data() :
            (await db.collection('users').where('username', '==', username).limit(1).get()).docs[0].data());

        const checks = {
            username: !!data.username,
            password: !!data.password,
            role: !!data.role,
            expires_atau_expired: !!(data.expires || data.expired || data.expires === 'never'),
            wallet_atau_balance: !!(typeof data.wallet === 'number' || typeof data.balance === 'number'),
            banned_field: typeof data.banned === 'boolean'
        };

        const allOk = Object.values(checks).every(v => v);
        const expText = data.expires === 'never' ? '♾️ Permanent' : (data.expires || data.expired || '-');

        let t = `${allOk ? '✅' : '⚠️'} *STATUS AKUN*\n━━━━━━━━━━━━━━━━━━\n\n`;
        t += `👤 \`${data.username}\`\n`;
        t += `🎭 Role: \`${data.role}\`\n`;
        t += `📅 Expires: ${expText}\n`;
        t += `💰 Wallet: ${rupiah(data.wallet || 0)}\n`;
        t += `💵 Balance: ${rupiah(data.balance || 0)}\n`;
        t += `🚫 Banned: ${data.banned ? 'YA' : 'Tidak'}\n`;
        t += `\n*Field check:*\n`;
        for (const [k, v] of Object.entries(checks)) {
            t += `${v ? '✅' : '❌'} ${k}\n`;
        }
        t += `\n${allOk ? '🔐 *SIAP LOGIN*' : '⚠️ Jalankan /fixuser ' + username}`;

        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/testlogin\s+(\S+)\s+(\S+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const [, username, password] = match;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const ref = db.collection('users').doc(username);
        const snap = await ref.get();

        if (!snap.exists) {
            return bot.sendMessage(msg.chat.id, `❌ User \`${username}\` tidak ditemukan`, { parse_mode: 'Markdown' });
        }

        const data = snap.data();

        if (data.password !== password) {
            return bot.sendMessage(msg.chat.id,
                `❌ Password salah\n\nTersimpan: \`${data.password}\`\nInput: \`${password}\``,
                { parse_mode: 'Markdown' }
            );
        }

        if (data.banned === true) {
            return bot.sendMessage(msg.chat.id, `🚫 Akun di-BANNED: ${data.banReason || '-'}`, { parse_mode: 'Markdown' });
        }

        const exp = data.expires || data.expired;
        let expStatus = '✅ Lifetime';
        if (exp && exp !== 'never') {
            const dt = new Date(exp);
            if (dt < new Date()) {
                return bot.sendMessage(msg.chat.id, `⏰ Akun *expired* pada ${exp}`, { parse_mode: 'Markdown' });
            }
            expStatus = `✅ Aktif s/d ${exp}`;
        }

        bot.sendMessage(msg.chat.id,
            `✅ *LOGIN SIMULASI BERHASIL*\n\n` +
            `👤 \`${data.username}\`\n` +
            `🔑 \`${data.password}\`\n` +
            `🎭 Role: \`${data.role}\`\n` +
            `📅 ${expStatus}\n` +
            `💰 Wallet: ${rupiah(data.wallet || 0)}\n\n` +
            `🔐 Akun ini *BISA LOGIN*`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/fixuser\s+(\S+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const username = match[1];

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const ref = db.collection('users').doc(username);
        const snap = await ref.get();

        if (!snap.exists) {
            return bot.sendMessage(msg.chat.id, `❌ \`${username}\` tidak ditemukan`, { parse_mode: 'Markdown' });
        }

        const data = snap.data();
        const patch = {};

        if (typeof data.wallet === 'number' && typeof data.balance !== 'number') patch.balance = data.wallet;
        if (typeof data.balance === 'number' && typeof data.wallet !== 'number') patch.wallet = data.balance;
        if (data.expires && !('expired' in data)) patch.expired = data.expires === 'never' ? null : data.expires;
        if (data.expired !== undefined && !data.expires) patch.expires = data.expired || 'never';
        if (!data.createdAt && data.joinedAt) patch.createdAt = data.joinedAt;
        if (!data.joinedAt && data.createdAt) patch.joinedAt = data.createdAt;
        if (typeof data.banned !== 'boolean') patch.banned = false;
        if (!data.banReason) patch.banReason = '';
        if (!data.avatar) patch.avatar = '';
        if (!Array.isArray(data.themes)) patch.themes = [];
        if (!Array.isArray(data.achievements)) patch.achievements = [];
        if (!Array.isArray(data.additionalRoles)) patch.additionalRoles = [];
        if (typeof data.exp !== 'number') patch.exp = 0;
        patch.loginReady = true;

        if (Object.keys(patch).length === 0) {
            return bot.sendMessage(msg.chat.id, `✅ \`${username}\` sudah OK`, { parse_mode: 'Markdown' });
        }

        await ref.update(patch);

        let t = `✅ *FIXED:* \`${username}\`\n\n*Field diperbaiki:*\n`;
        for (const k of Object.keys(patch)) t += `• \`${k}\`\n`;
        t += `\n🔐 Sekarang *BISA LOGIN*`;
        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/syncusers/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const statusMsg = await bot.sendMessage(msg.chat.id, '⏳ Scanning...');

        const snap = await db.collection('users').get();
        let fixed = 0, ok = 0, failed = 0;
        const fixes = [];

        for (const doc of snap.docs) {
            try {
                const data = doc.data();
                const patch = {};

                if (typeof data.wallet === 'number' && typeof data.balance !== 'number') patch.balance = data.wallet;
                if (typeof data.balance === 'number' && typeof data.wallet !== 'number') patch.wallet = data.balance;
                if (data.expires && !('expired' in data)) patch.expired = data.expires === 'never' ? null : data.expires;
                if (data.expired !== undefined && !data.expires) patch.expires = data.expired || 'never';
                if (!data.createdAt && data.joinedAt) patch.createdAt = data.joinedAt;
                if (!data.joinedAt && data.createdAt) patch.joinedAt = data.createdAt;
                if (typeof data.banned !== 'boolean') patch.banned = false;
                if (!data.banReason) patch.banReason = '';
                if (!data.avatar) patch.avatar = '';
                if (!Array.isArray(data.themes)) patch.themes = [];
                if (!Array.isArray(data.achievements)) patch.achievements = [];
                if (!Array.isArray(data.additionalRoles)) patch.additionalRoles = [];
                if (typeof data.exp !== 'number') patch.exp = 0;

                if (Object.keys(patch).length === 0) { ok++; continue; }

                patch.loginReady = true;
                await doc.ref.update(patch);
                fixed++;
                if (fixes.length < 5) fixes.push(doc.id);
            } catch (e) { failed++; }
        }

        let t = `✅ *SYNC COMPLETE*\n\n`;
        t += `📊 Total: *${snap.size}*\n`;
        t += `✅ OK: *${ok}*\n`;
        t += `🔧 Diperbaiki: *${fixed}*\n`;
        t += `❌ Gagal: *${failed}*\n\n`;
        if (fixes.length) {
            t += `*Contoh:*\n`;
            fixes.forEach(f => { t += `• \`${f}\`\n`; });
        }

        await bot.editMessageText(t, {
            chat_id: msg.chat.id,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
        });
    } catch (e) {
        logger.error('syncusers error:', e);
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/diag/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const usersSnap = await db.collection('users').limit(1).get();
        const usersCount = (await db.collection('users').get()).size;
        const poolCount = (await db.collection('account_pool').get()).size;
        const botInfo = await bot.getMe();

        let t = `🔍 *DIAGNOSTIK*\n━━━━━━━━━━━━━━━━━━\n\n`;
        t += `*Firebase:*\n✅ Connected\n👥 Users: *${usersCount}*\n📦 Pool: *${poolCount}*\n\n`;
        t += `*Bot:*\n✅ @${botInfo.username}\n🆔 \`${botInfo.id}\`\n\n`;
        t += `*Owner:*\n🆔 \`${CONFIG.OWNER_ID}\`\n✅ ${msg.from.id === CONFIG.OWNER_ID ? 'YES' : 'NO'}\n\n`;
        t += `*Security:*\n`;
        t += `🔐 API Key: ${CONFIG.BUG_API_KEY ? '✅' : '❌'}\n`;
        t += `🚦 Rate: ${CONFIG.BUG_RATE_LIMIT.perMinute}/min\n`;
        t += `📦 Payload Max: ${CONFIG.BUG_PAYLOAD_MAX}\n\n`;
        t += `*Bug Notif:*\n`;
        t += `🔔 Enabled: ${CONFIG.BUG_NOTIF_ENABLED ? '✅ ON' : '🚫 OFF'}\n`;
        t += `💬 Chat ID: \`${CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT || 'belum diset'}\`\n`;

        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        logger.error('diag error:', e);
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/deleteaccount\s+(\S+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const username = match[1];

    try {
        let deletedPool = false, deletedUser = false;

        const poolSnap = await db.collection('account_pool')
            .where('username', '==', username).limit(1).get();
        if (!poolSnap.empty) {
            await poolSnap.docs[0].ref.delete();
            deletedPool = true;
        }

        const userRef = db.collection('users').doc(username);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
            await userRef.delete();
            deletedUser = true;
        }

        if (!deletedPool && !deletedUser) {
            return bot.sendMessage(msg.chat.id, `❌ \`${username}\` tidak ditemukan`, { parse_mode: 'Markdown' });
        }

        bot.sendMessage(msg.chat.id,
            `✅ \`${username}\` dihapus\n\nPool: ${deletedPool ? '✅' : '❌'}\nUsers: ${deletedUser ? '✅' : '❌'}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/clearused/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        const snap = await db.collection('account_pool').where('status', '==', 'used').get();
        if (snap.empty) return bot.sendMessage(msg.chat.id, '📭 Tidak ada akun terpakai');

        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        bot.sendMessage(msg.chat.id, `✅ ${snap.size} akun terpakai dihapus`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/migratepool/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const statusMsg = await bot.sendMessage(msg.chat.id, '⏳ Migrating...');

        const snap = await db.collection('account_pool').get();
        let migrated = 0, skipped = 0, failed = 0;

        for (const doc of snap.docs) {
            const data = doc.data();
            const username = data.username;
            if (!username) { skipped++; continue; }

            const userRef = db.collection('users').doc(username);
            const userSnap = await userRef.get();
            if (userSnap.exists) { skipped++; continue; }

            let role = 'premium';
            if (data.type === 'owner') role = 'owner';
            else if (data.type === 'admin') role = 'admin';
            else if (data.type === 'reseller') role = 'reseller';

            let expires = 'never';
            if (!data.permanent && data.expiresAt) {
                const dt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
                expires = dt.toISOString().slice(0, 10);
            }

            try {
                const userData = buildUserData({
                    username,
                    password: data.password,
                    role,
                    expires,
                    typeId: data.type,
                    typeName: data.typeName,
                    days: data.days || null,
                    generatedBy: data.generatedBy || 'migration',
                    source: 'migrated_from_pool'
                });
                await userRef.set(userData);
                migrated++;
            } catch (e) {
                logger.error(`Failed migrate ${username}:`, e);
                failed++;
            }
        }

        await bot.editMessageText(
            `✅ *MIGRASI SELESAI*\n\n` +
            `📦 Total: ${snap.size}\n` +
            `✅ Migrated: *${migrated}*\n` +
            `⏭️ Skipped: *${skipped}*\n` +
            `❌ Failed: *${failed}*`,
            { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        );
    } catch (e) {
        logger.error('Migration error:', e);
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/stats/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const tSnap = await db.collection('transactions').get();
        const aSnap = await db.collection('accounts').get();
        const uSnap = await db.collection('users').get();
        const pSnap = await db.collection('account_pool').where('status', '==', 'available').get();

        let rev = 0, paid = 0, pending = 0;
        tSnap.forEach(d => {
            const x = d.data();
            if (x.status === 'paid') { rev += Number(x.total || 0); paid++; }
            else if (x.status === 'pending') pending++;
        });

        bot.sendMessage(msg.chat.id,
            `📊 *STATISTIK*\n━━━━━━━━━━━━━━━━━━\n\n` +
            `💰 Revenue: *${rupiah(rev)}*\n` +
            `✅ Lunas: *${paid}*\n` +
            `⏳ Pending: *${pending}*\n` +
            `📦 Terjual: *${aSnap.size}*\n` +
            `🎁 Pool: *${pSnap.size}*\n` +
            `👥 Users: *${uSnap.size}*\n` +
            `📈 Transaksi: *${tSnap.size}*\n\n` +
            `🕐 ${new Date().toLocaleString('id-ID')}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const pesan = match[1];
    if (!pesan) return;

    try {
        const snap = await db.collection('users').get();
        let sent = 0, failed = 0;

        for (const doc of snap.docs) {
            const u = doc.data();
            if (!u.telegram) continue;
            const chatId = String(u.telegram).replace(/[^0-9]/g, '') ||
                           String(u.telegram).replace('@', '');
            try {
                await bot.sendMessage(chatId, `📢 *PENGUMUMAN*\n\n${pesan}`, { parse_mode: 'Markdown' });
                sent++;
                await sleep(50);
            } catch (e) {
                failed++;
            }
        }
        bot.sendMessage(msg.chat.id, `✅ Broadcast selesai\n\nTerkirim: ${sent}\nGagal: ${failed}`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ==========================================================
   🆕 BUG COMMANDS v9.0
   ========================================================== */

bot.onText(/\/bugstats/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const snap = await db.collection('bug_logs').get();
        const stats = {
            total: snap.size, direct: 0, group_wa: 0,
            withPayload: 0, withoutPayload: 0, byBug: {}
        };

        snap.forEach(d => {
            const x = d.data();
            if (x.source === 'group_wa') stats.group_wa++;
            else stats.direct++;
            if (x.hasPayload || (x.payload && x.payload.trim())) stats.withPayload++;
            else stats.withoutPayload++;
            const key = x.bugName || 'unknown';
            stats.byBug[key] = (stats.byBug[key] || 0) + 1;
        });

        const topBugs = Object.entries(stats.byBug)
            .sort((a, b) => b[1] - a[1]).slice(0, 5);

        let text = `🐛 *BUG STATISTICS*\n━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📊 Total: *${stats.total}*\n`;
        text += `💥 Direct: *${stats.direct}*\n`;
        text += `💬 Group WA: *${stats.group_wa}*\n\n`;
        text += `📦 With Payload: *${stats.withPayload}*\n`;
        text += `⚠️ Without Payload: *${stats.withoutPayload}*\n\n`;
        text += `🏆 *Top Bugs:*\n`;
        topBugs.forEach(([name, count], i) => {
            text += `${i + 1}. ${escapeMarkdown(name)} — *${count}x*\n`;
        });

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

bot.onText(/\/bugrecent(?:\s+(\d+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const limit = Math.min(parseInt(match[1]) || 10, 30);

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const snap = await db.collection('bug_logs')
            .orderBy('createdAt', 'desc').limit(limit).get();

        if (snap.empty) return bot.sendMessage(msg.chat.id, '📭 Belum ada log bug');

        let text = `🐛 *${limit} BUG TERAKHIR*\n━━━━━━━━━━━━━━━━━━\n\n`;
        let idx = 1;

        snap.forEach(d => {
            const x = d.data();
            const time = x.createdAt?.toDate
                ? x.createdAt.toDate().toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    hour: '2-digit', minute: '2-digit',
                    day: '2-digit', month: '2-digit'
                })
                : '-';
            const payloadIcon = x.hasPayload ? '✅' : '⚠️';
            const sourceIcon = x.source === 'group_wa' ? '💬' : '💥';

            text += `*${idx++}.* ${sourceIcon} ${escapeMarkdown(x.bugName || '-')}\n`;
            text += `   👤 \`${x.username || '-'}\`\n`;
            text += `   🎯 \`${String(x.target || '-').slice(0, 30).replace(/`/g, '\'')}\`\n`;
            text += `   ${payloadIcon} ${x.payloadLength || 0} chars\n`;
            text += `   🕐 ${time}\n\n`;
        });

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

bot.onText(/\/bugnotif(?:\s+(on|off))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const arg = match[1]?.toLowerCase();

    if (!arg) {
        const status = CONFIG.BUG_NOTIF_ENABLED ? '✅ ON' : '🚫 OFF';
        const chatId = CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT;
        return bot.sendMessage(msg.chat.id,
            `🔔 *Bug Notif Status*\n\n` +
            `Status: *${status}*\n` +
            `Chat ID: \`${chatId || 'belum diset'}\`\n\n` +
            `Commands:\n` +
            `• \`/bugnotif on\` — Aktifkan\n` +
            `• \`/bugnotif off\` — Nonaktifkan\n` +
            `• \`/setbugchat <chat_id>\` — Ganti chat\n` +
            `• \`/bugsetup\` — Test & verify`,
            { parse_mode: 'Markdown' }
        );
    }

    CONFIG.BUG_NOTIF_ENABLED = (arg === 'on');
    bot.sendMessage(msg.chat.id,
        `🔔 Bug notif: *${CONFIG.BUG_NOTIF_ENABLED ? 'AKTIF ✅' : 'NONAKTIF 🚫'}*`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/bugtest/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    bot.sendChatAction(msg.chat.id, 'typing');

    const result = await sendBugNotification({
        source: 'direct',
        username: 'test_user',
        bugName: 'Crash Force Close',
        bugId: 'crash_crash_force_close',
        category: 'crash',
        target: '628123456789',
        payload: `[TEST_PAYLOAD]\ntarget: 628123456789\nmethod: force_close\nintensity: 9\nnotes: Test notifikasi dari /bugtest`,
        delay: 1500,
        severity: 'high',
        userAgent: 'Mozilla/5.0 (Test)'
    });

    if (result.ok) {
        bot.sendMessage(msg.chat.id,
            `✅ *TEST NOTIF BERHASIL*\n\n` +
            `Mode: *${result.mode}*\n` +
            `Chat ID: \`${CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT}\`\n` +
            `Message ID: \`${result.messageId}\``,
            { parse_mode: 'Markdown' }
        );
    } else {
        bot.sendMessage(msg.chat.id,
            `❌ *TEST NOTIF GAGAL*\n\n` +
            `Error: \`${result.error || 'unknown'}\`\n` +
            `Mode: *${result.mode || 'failed'}*\n\n` +
            `*Kemungkinan penyebab:*\n` +
            `• Bot belum jadi member di grup\n` +
            `• Chat ID salah\n` +
            `• Bot tidak punya izin kirim pesan\n\n` +
            `Coba \`/bugsetup\` untuk diagnose`,
            { parse_mode: 'Markdown' }
        );
    }
});

bot.onText(/\/bugsetup/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    bot.sendChatAction(msg.chat.id, 'typing');

    const chatId = CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT;
    let report = `🔧 *BUG NOTIF SETUP CHECK*\n━━━━━━━━━━━━━━━━━━\n\n`;

    /* Check 1: Notif enabled */
    report += `1️⃣ Notif Enabled: ${CONFIG.BUG_NOTIF_ENABLED ? '✅' : '❌'}\n`;

    /* Check 2: Chat ID */
    report += `2️⃣ Chat ID: ${chatId ? `✅ \`${chatId}\`` : '❌ kosong'}\n`;

    /* Check 3: Test bot getChat */
    if (chatId) {
        try {
            const chatInfo = await bot.getChat(chatId);
            report += `3️⃣ Bot access: ✅\n`;
            report += `   Type: \`${chatInfo.type}\`\n`;
            if (chatInfo.title) report += `   Title: ${escapeMarkdown(chatInfo.title)}\n`;
        } catch (e) {
            report += `3️⃣ Bot access: ❌\n   Error: \`${e.message}\`\n`;
            report += `   💡 Bot mungkin belum member di grup ini\n`;
        }
    }

    /* Check 4: Test send message */
    if (chatId) {
        try {
            const testMsg = await bot.sendMessage(chatId,
                `🔧 *Test dari /bugsetup*\n\nJika kamu lihat pesan ini, setup notif SUDAH BENAR ✅`,
                { parse_mode: 'Markdown' }
            );
            report += `4️⃣ Test send: ✅\n   Message ID: \`${testMsg.message_id}\`\n`;
        } catch (e) {
            report += `4️⃣ Test send: ❌\n   Error: \`${e.message}\`\n`;
        }
    }

    report += `\n━━━━━━━━━━━━━━━━━━\n`;
    report += `💡 Jika ada ❌, perbaiki dulu sebelum test bug.`;

    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
});

bot.onText(/\/setbugchat(?:\s+(-?\d+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const newChatId = match[1];

    if (!newChatId) {
        const current = CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT;
        return bot.sendMessage(msg.chat.id,
            `💬 *Set Bug Chat ID*\n\n` +
            `Current: \`${current}\`\n\n` +
            `Usage:\n` +
            `• \`/setbugchat -1001234567890\` — Set new\n` +
            `• \`/setbugchat reset\` — Reset ke default\n\n` +
            `💡 Cara cari Chat ID:\n` +
            `1. Add bot ke grup/channel\n` +
            `2. Forward pesan dari grup ke @userinfobot\n` +
            `3. Copy chat ID (mulai dengan -100...)`,
            { parse_mode: 'Markdown' }
        );
    }

    const parsedId = parseInt(newChatId, 10);
    CONFIG.BUG_NOTIF_CHAT = parsedId;

    /* Test kirim ke chat baru */
    try {
        await bot.sendMessage(parsedId,
            `✅ *Bug notif chat di-set ke sini*\n\nChat ID: \`${parsedId}\``,
            { parse_mode: 'Markdown' }
        );

        bot.sendMessage(msg.chat.id,
            `✅ *Chat ID updated*\n\nNew: \`${parsedId}\`\nTest message terkirim ✅`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id,
            `⚠️ *Chat ID updated tapi test gagal*\n\n` +
            `New: \`${parsedId}\`\n` +
            `Error: \`${e.message}\`\n\n` +
            `💡 Pastikan bot adalah member di chat tersebut`,
            { parse_mode: 'Markdown' }
        );
    }
});

bot.onText(/\/bugdebug/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    bot.sendChatAction(msg.chat.id, 'typing');

    const sample = {
        source: 'direct',
        username: 'john_doe',
        bugName: 'Crash Force Close',
        bugId: 'crash_crash_force_close',
        category: 'crash',
        target: '628123456789',
        payload: `[CRASH_FORCE_PAYLOAD]\ntarget: 628123456789\nmethod: force_close\nintensity: 9\n_test: special_chars\n*star* \`tick\` [bracket]`,
        delay: 1500,
        severity: 'high',
        userAgent: 'Mozilla/5.0 (Linux; Android 13)'
    };

    let report = `🐛 *BUG DEBUG*\n━━━━━━━━━━━━━━━━━━\n\n`;

    /* Preview Markdown */
    try {
        const mdMsg = formatBugNotifMD(sample);
        report += `✅ Markdown format: OK (${mdMsg.length} chars)\n`;
    } catch (e) {
        report += `❌ Markdown format: ${e.message}\n`;
    }

    /* Preview Plain */
    try {
        const plainMsg = formatBugNotifPlain(sample);
        report += `✅ Plain format: OK (${plainMsg.length} chars)\n`;
    } catch (e) {
        report += `❌ Plain format: ${e.message}\n`;
    }

    /* Send preview */
    report += `\n📤 Sending preview...\n`;
    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });

    /* Send actual sample */
    const result = await sendBugNotification(sample);

    setTimeout(() => {
        if (result.ok) {
            bot.sendMessage(msg.chat.id, `✅ Preview terkirim (mode: ${result.mode})`);
        } else {
            bot.sendMessage(msg.chat.id, `❌ Gagal: ${result.error}`);
        }
    }, 1000);
});

bot.onText(/\/bughelp/, (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const text = `🐛 *BUG COMMANDS*\n━━━━━━━━━━━━━━━━━━\n\n` +
        `• /bugstats — Statistik bug\n` +
        `• /bugrecent [n] — n bug terakhir\n` +
        `• /bugnotif [on/off] — Toggle notif\n` +
        `• /bugtest — Test notif\n` +
        `• /bugsetup — Verify setup + test\n` +
        `• /setbugchat <id> — Ganti chat notif\n` +
        `• /bugdebug — Debug format payload\n` +
        `• /bughelp — Bantuan ini`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

/* ==========================================================
   EXPRESS SERVER
   ========================================================== */
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
    if (CONFIG.VERBOSE) logger.debug(`${req.method} ${req.path}`);
    next();
});

app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'Zeyron Command Bot',
        version: '9.0.0',
        features: [
            'order', 'payment', 'account-generator', 'custom-user',
            'pool-system', 'multi-role', 'bug-executor', 'telegram-notif'
        ],
        security: {
            apiKeyRequired: true,
            rateLimiting: true,
            payloadValidation: true
        },
        bugNotif: {
            enabled: CONFIG.BUG_NOTIF_ENABLED,
            chatId: CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT || null
        },
        time: new Date().toISOString()
    });
});

/* ==========================================================
   ORDER
   ========================================================== */
app.post('/order', async (req, res) => {
    try {
        const { invoice, role, roleId, duration, total, telegram, days } = req.body;

        if (!invoice || !telegram || !roleId) {
            return res.status(400).json({ ok: false, error: 'Missing fields' });
        }

        const existing = await db.collection('accounts')
            .where('invoice', '==', invoice).limit(1).get();
        if (!existing.empty) return res.json({ ok: true, message: 'Already delivered' });

        const acc = await claimAccount(roleId, telegram, invoice);

        await db.collection('accounts').add({
            invoice,
            username: acc.username,
            password: acc.password,
            telegram,
            role: acc.typeName || role,
            roleId: acc.type,
            expiresAt: acc.expiresAt,
            fromPool: acc.fromPool,
            createdAt: FieldValue.serverTimestamp()
        });

        const tgId = String(telegram).replace(/[^0-9]/g, '') ||
                     String(telegram).replace('@', '');

        const expText = acc.expiresAt
            ? acc.expiresAt.toDate().toLocaleString('id-ID')
            : '♾️ Permanent';

        const userMsg =
            `🎉 *PEMBAYARAN BERHASIL*\n\n` +
            `📦 *Detail Akun*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🎯 Tipe: *${escapeMarkdown(acc.typeName || role)}*\n` +
            `⏳ Durasi: *${duration}*\n` +
            `📅 Expired: ${expText}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 Username: \`${acc.username}\`\n` +
            `🔑 Password: \`${acc.password}\`\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🧾 Invoice: \`${invoice}\`\n` +
            `💰 Total: *${rupiah(total)}*\n\n` +
            `⚠️ _Jangan bagikan!_`;

        let delivered = false;
        try {
            await bot.sendMessage(tgId, userMsg, { parse_mode: 'Markdown' });
            delivered = true;
        } catch (e) {
            await db.collection('pending_deliveries').add({
                telegram: tgId, message: userMsg, invoice,
                reason: e.message,
                createdAt: FieldValue.serverTimestamp()
            });
        }

        if (CONFIG.ADMIN_CHAT) {
            bot.sendMessage(CONFIG.ADMIN_CHAT,
                `💰 *NEW ORDER*\n\n` +
                `🧾 \`${invoice}\`\n` +
                `🎯 ${escapeMarkdown(acc.typeName || role)}\n` +
                `👤 \`${acc.username}\`\n` +
                `💰 ${rupiah(total)}\n` +
                `📬 ${delivered ? '✅' : '❌'}\n` +
                `📍 ${acc.fromPool ? 'pool' : 'auto-gen'}`,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
        }

        res.json({ ok: true, invoice, username: acc.username, fromPool: acc.fromPool, delivered });
    } catch (e) {
        logger.error('Order error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   PAYMENT
   ========================================================== */
app.post('/payment/create', async (req, res) => {
    try {
        const { invoice, amount, customer, type, roleId, days } = req.body;
        if (!invoice || !amount) {
            return res.status(400).json({ ok: false, error: 'Missing fields' });
        }

        let qrisUrl = '', provider = 'demo';

        if (CONFIG.PAYMENT_PROVIDER === 'pakasir' && CONFIG.PAYMENT_API_KEY) {
            try {
                const resp = await fetch('https://pakasir.zone.id/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project: CONFIG.PAYMENT_PROJECT,
                        amount: Number(amount),
                        order_id: invoice,
                        api_key: CONFIG.PAYMENT_API_KEY
                    })
                });
                const data = await resp.json();
                qrisUrl = data.payment_url || data.qris_url || '';
                provider = 'pakasir';
            } catch (e) {
                logger.warn('Pakasir error:', e.message);
            }
        }

        if (!qrisUrl) {
            const payload = `00020101021226610014ID.CO.QRIS.WWW0118${invoice}0215ID1020021949203031ID5204581253033605802ID5910ZEYRON CO6007JAKARTA61051219062070703A015402${amount}6304ABCD`;
            qrisUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&bgcolor=ffffff&color=000000&data=' +
                encodeURIComponent(payload);
        }

        await db.collection('topups').doc(invoice).set({
            invoice, username: customer,
            amount: Number(amount),
            type: type || 'topup',
            roleId: roleId || null,
            days: days || null,
            status: 'pending',
            qrisUrl, provider,
            createdAt: FieldValue.serverTimestamp()
        });

        res.json({ ok: true, qris_url: qrisUrl, provider, invoice });
    } catch (e) {
        logger.error('Create payment error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.get('/payment/check/:invoice', async (req, res) => {
    try {
        const snap = await db.collection('topups').doc(req.params.invoice).get();
        if (!snap.exists) return res.json({ ok: true, status: 'not_found' });
        res.json({ ok: true, status: snap.data().status, data: snap.data() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/payment/webhook', async (req, res) => {
    try {
        const body = req.body;
        logger.info('Webhook received');

        const invoice = body.order_id || body.invoice || body.merchant_ref;
        const status = (body.status || body.payment_status || '').toLowerCase();
        const amount = body.amount || body.total || body.paid_amount;

        if (!invoice) return res.status(400).json({ ok: false, error: 'No invoice' });

        const successStatus = ['paid', 'completed', 'settlement', 'success', 'berhasil', 'lunas'];
        if (!successStatus.includes(status)) return res.json({ ok: true, received: true });

        const topupRef = db.collection('topups').doc(invoice);
        const topupSnap = await topupRef.get();
        if (!topupSnap.exists) return res.status(404).json({ ok: false, error: 'Invoice not found' });

        const topup = topupSnap.data();
        if (topup.status === 'paid') return res.json({ ok: true, message: 'Already processed' });

        await topupRef.update({
            status: 'paid',
            paidAt: FieldValue.serverTimestamp(),
            webhookData: body
        });

        if (topup.type === 'topup' && topup.username) {
            const userRef = db.collection('users').doc(topup.username);
            const userSnap = await userRef.get();

            if (userSnap.exists) {
                const user = userSnap.data();
                const cur = Number(user.balance || user.wallet || 0);
                const newSaldo = cur + Number(topup.amount);

                await userRef.update({
                    wallet: newSaldo,
                    balance: newSaldo,
                    lastTopup: new Date().toISOString()
                });

                logger.success(`Topup: ${topup.username} +${rupiah(topup.amount)}`);

                if (user.telegram) {
                    const tgId = String(user.telegram).replace(/[^0-9]/g, '') ||
                                 String(user.telegram).replace('@', '');
                    bot.sendMessage(tgId,
                        `💰 *TOP-UP BERHASIL*\n\n` +
                        `💵 Nominal: *${rupiah(topup.amount)}*\n` +
                        `🧾 Invoice: \`${invoice}\`\n` +
                        `💳 Saldo: *${rupiah(newSaldo)}*`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => {});
                }

                if (CONFIG.ADMIN_CHAT) {
                    bot.sendMessage(CONFIG.ADMIN_CHAT,
                        `💰 *TOP-UP MASUK*\n\n` +
                        `👤 \`${topup.username}\`\n` +
                        `💵 *${rupiah(topup.amount)}*\n` +
                        `🧾 \`${invoice}\``,
                        { parse_mode: 'Markdown' }
                    ).catch(() => {});
                }
            }
        }

        res.json({ ok: true });
    } catch (e) {
        logger.error('Webhook error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   API: GENERATE
   ========================================================== */
app.post('/api/generate', async (req, res) => {
    try {
        const { secret, roleId, typeId, count, duration, username, password } = req.body;
        if (secret !== CONFIG.WEBHOOK_SECRET) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }

        const tid = typeId || roleId;
        if (!ACCOUNT_TYPES[tid]) {
            return res.status(400).json({ ok: false, error: 'Invalid type' });
        }

        const n = Math.min(parseInt(count) || 1, 100);
        const accounts = [];

        for (let i = 0; i < n; i++) {
            const acc = await generateAccount(
                tid, duration, 'api',
                (n === 1 && username) ? username : null,
                (n === 1 && password) ? password : null
            );
            accounts.push(acc);
        }

        res.json({ ok: true, count: accounts.length, accounts });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   DEV ENDPOINTS
   ========================================================== */
app.post('/dev/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ ok: false });

        const snap = await db.collection('developers')
            .where('email', '==', email)
            .where('password', '==', password)
            .limit(1).get();

        if (snap.empty) return res.status(401).json({ ok: false, error: 'Kredensial salah' });

        const dev = snap.docs[0].data();
        if (dev.active === false) return res.status(401).json({ ok: false, error: 'Akun nonaktif' });

        res.json({ ok: true, dev: { email: dev.email, name: dev.name || 'Developer' } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/dev/change-password', async (req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.body;
        if (!email || !oldPassword || !newPassword) return res.status(400).json({ ok: false });
        if (newPassword.length < 8) return res.status(400).json({ ok: false, error: 'Min 8 karakter' });

        const snap = await db.collection('developers')
            .where('email', '==', email)
            .where('password', '==', oldPassword)
            .limit(1).get();

        if (snap.empty) return res.status(401).json({ ok: false, error: 'Password salah' });

        await snap.docs[0].ref.update({
            password: newPassword,
            updatedAt: FieldValue.serverTimestamp()
        });

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/dev/discount', async (req, res) => {
    try {
        const { email, password, roleId, amount, active } = req.body;
        const devSnap = await db.collection('developers')
            .where('email', '==', email)
            .where('password', '==', password)
            .limit(1).get();

        if (devSnap.empty) return res.status(401).json({ ok: false, error: 'Unauthorized' });

        await db.collection('discounts').doc(roleId).set({
            amount: Number(amount || 0),
            active: !!active,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: email
        }, { merge: true });

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/dev/settings', async (req, res) => {
    try {
        const { email, password, banner, siteName, apkUrl, telegramWebhook } = req.body;
        const devSnap = await db.collection('developers')
            .where('email', '==', email)
            .where('password', '==', password)
            .limit(1).get();

        if (devSnap.empty) return res.status(401).json({ ok: false, error: 'Unauthorized' });

        const updates = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: email
        };
        if (banner !== undefined) updates.banner = banner;
        if (siteName) updates.siteName = siteName;
        if (apkUrl) updates.apkUrl = apkUrl;
        if (telegramWebhook) updates.telegramWebhook = telegramWebhook;

        await db.collection('settings').doc('site').set(updates, { merge: true });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   BUY ROLE
   ========================================================== */
app.post('/buy/role', async (req, res) => {
    try {
        const { username, roleId, days } = req.body;
        if (!username || !roleId) return res.status(400).json({ ok: false, error: 'Missing fields' });

        const type = ACCOUNT_TYPES[roleId];
        if (!type) return res.status(400).json({ ok: false, error: 'Role tidak valid' });

        let total = 0, duration = 'never';

        if (roleId === 'member') {
            const d = parseInt(days);
            if (isNaN(d) || d < 1 || d > 10) return res.status(400).json({ ok: false, error: 'Durasi 1-10 hari' });
            total = type.pricePerDay * d;
            const expiry = new Date(Date.now() + d * 86400000);
            duration = expiry.toISOString().slice(0, 10);
        } else {
            total = type.price;
        }

        const userRef = db.collection('users').doc(username);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });

        const user = userSnap.data();
        const saldo = Number(user.balance || user.wallet || 0);

        if (saldo < total) {
            return res.status(400).json({
                ok: false, error: 'Saldo tidak cukup',
                needed: total - saldo, saldo
            });
        }

        const isDev = user.role === 'developer';
        const expiredVal = duration === 'never' ? null : duration;

        if (isDev) {
            const additional = user.additionalRoles || [];
            if (!additional.includes(roleId)) additional.push(roleId);
            await userRef.update({
                wallet: saldo - total,
                balance: saldo - total,
                role: 'developer',
                additionalRoles: additional
            });
        } else {
            await userRef.update({
                wallet: saldo - total,
                balance: saldo - total,
                role: type.loginRole,
                expires: duration,
                expired: expiredVal
            });
        }

        await db.collection('transactions').add({
            invoice: 'BUY-' + Date.now().toString(36).toUpperCase(),
            username, roleId,
            roleName: type.name,
            days: days || null,
            total, status: 'paid',
            type: 'role_purchase',
            createdAt: FieldValue.serverTimestamp()
        });

        res.json({
            ok: true,
            newSaldo: saldo - total,
            role: type.name,
            expires: duration,
            isDeveloper: isDev
        });
    } catch (e) {
        logger.error('Buy role error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   REDEEM
   ========================================================== */
app.post('/redeem/buy', async (req, res) => {
    try {
        const { resellerUsername, roleId, days } = req.body;
        const resellerRef = db.collection('users').doc(resellerUsername);
        const resellerSnap = await resellerRef.get();

        if (!resellerSnap.exists) return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });

        const reseller = resellerSnap.data();
        const allRoles = [reseller.role, ...(reseller.additionalRoles || [])];
        const isResellerOrUp = allRoles.some(r => ['reseller', 'admin', 'owner', 'developer'].includes(r));

        if (!isResellerOrUp) return res.status(403).json({ ok: false, error: 'Hanya Reseller/Admin/Owner' });

        const type = ACCOUNT_TYPES[roleId];
        if (!type) return res.status(400).json({ ok: false, error: 'Role tidak valid' });

        let basePrice = 0;
        if (roleId === 'member') {
            const d = parseInt(days) || 1;
            basePrice = type.pricePerDay * d;
        } else {
            basePrice = type.price;
        }
        const price = Math.round(basePrice * 0.5);

        const saldo = Number(reseller.balance || reseller.wallet || 0);
        if (saldo < price) return res.status(400).json({ ok: false, error: 'Saldo tidak cukup', needed: price });

        const code = 'ZYR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

        await db.collection('redeem_codes').doc(code).set({
            code, roleId,
            roleName: type.name,
            days: days || null,
            createdBy: resellerUsername,
            status: 'available',
            createdAt: FieldValue.serverTimestamp(),
            redeemedBy: null,
            redeemedAt: null
        });

        await resellerRef.update({
            wallet: saldo - price,
            balance: saldo - price
        });

        res.json({ ok: true, code, price, roleName: type.name, days: days || null, newSaldo: saldo - price });
    } catch (e) {
        logger.error('Redeem buy error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/redeem/use', async (req, res) => {
    try {
        const { username, code } = req.body;
        if (!username || !code) return res.status(400).json({ ok: false, error: 'Missing fields' });

        const codeRef = db.collection('redeem_codes').doc(code);
        const codeSnap = await codeRef.get();
        if (!codeSnap.exists) return res.status(404).json({ ok: false, error: 'Kode tidak valid' });

        const codeData = codeSnap.data();
        if (codeData.status !== 'available') return res.status(400).json({ ok: false, error: 'Kode sudah terpakai' });
        if (codeData.createdBy === username) return res.status(400).json({ ok: false, error: 'Tidak bisa redeem kode sendiri' });

        let expires = 'never', expiredVal = null;
        if (codeData.days) {
            const d = parseInt(codeData.days);
            expires = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
            expiredVal = expires;
        }

        const userRef = db.collection('users').doc(username);
        const newRole = codeData.roleId === 'member' ? 'premium' : codeData.roleId;

        await userRef.update({
            role: newRole,
            expires,
            expired: expiredVal,
            roleUpdatedAt: new Date().toISOString()
        });

        await codeRef.update({
            status: 'used',
            redeemedBy: username,
            redeemedAt: FieldValue.serverTimestamp()
        });

        res.json({
            ok: true,
            roleName: codeData.roleName,
            expires,
            message: `Berhasil redeem ${codeData.roleName}`
        });
    } catch (e) {
        logger.error('Redeem use error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   BUY THEME
   ========================================================== */
app.post('/buy/theme', async (req, res) => {
    try {
        const { username, themeId } = req.body;

        const THEME_PRICES = {
            violet: { name: 'Violet', price: 1000 },
            gold: { name: 'Gold', price: 1000 },
            red: { name: 'Red', price: 1000 }
        };

        const theme = THEME_PRICES[themeId];
        if (!theme) return res.status(400).json({ ok: false, error: 'Tema tidak valid' });

        const userRef = db.collection('users').doc(username);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });

        const user = userSnap.data();
        const saldo = Number(user.balance || user.wallet || 0);

        if (saldo < theme.price) {
            return res.status(400).json({ ok: false, error: 'Saldo tidak cukup', needed: theme.price });
        }

        const owned = user.themes || [];
        if (owned.includes(themeId)) return res.status(400).json({ ok: false, error: 'Tema sudah dimiliki' });

        await userRef.update({
            wallet: saldo - theme.price,
            balance: saldo - theme.price,
            themes: [...owned, themeId]
        });

        res.json({
            ok: true,
            theme: themeId,
            newSaldo: saldo - theme.price,
            themes: [...owned, themeId]
        });
    } catch (e) {
        logger.error('Buy theme error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   BUG EXECUTOR — ENDPOINTS
   ========================================================== */

app.post('/bug/execute', requireApiKey, async (req, res) => {
    try {
        const {
            username, target, bugName, bugId, payload,
            category, delay, severity
        } = req.body;

        const userAgent = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

        logger.debug('Bug execute:', { username, bugName, target: String(target).slice(0, 20) });

        if (!target || !bugName) {
            return res.status(400).json({ ok: false, error: 'target & bugName wajib' });
        }

        const payloadCheck = validatePayload(payload);
        if (!payloadCheck.ok) {
            return res.status(400).json({ ok: false, error: payloadCheck.error });
        }

        const rl = checkBugRateLimit(username || ip);
        if (!rl.ok) {
            return res.status(rl.code || 429).json({ ok: false, error: rl.error });
        }

        const logId = await logBugToFirestore({
            source: 'direct',
            username, bugName, bugId, category,
            target, payload, delay, severity,
            status: 'sent', userAgent, ip
        });

        /* Kirim notif — return status */
        const notifResult = await sendBugNotification({
            source: 'direct',
            username, bugName, bugId, category,
            target, payload, delay, severity, userAgent
        });

        await sleep(CONFIG.BUG_SIM_DELAY);

        if (logId) {
            try {
                await db.collection('bug_logs').doc(logId).update({
                    status: 'executed',
                    executedAt: FieldValue.serverTimestamp(),
                    executionResult: 'simulation_success',
                    notifDelivered: notifResult.ok,
                    notifMode: notifResult.mode
                });
            } catch (e) { /* silent */ }
        }

        res.json({
            ok: true,
            logId,
            message: 'Bug dispatched',
            bugName,
            target,
            hasPayload: !!(payload && payload.trim()),
            notif: {
                delivered: notifResult.ok,
                mode: notifResult.mode,
                error: notifResult.error || null
            },
            status: 'sent',
            time: new Date().toISOString()
        });

    } catch (e) {
        logger.error('Bug execute error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/bug/group/execute', requireApiKey, async (req, res) => {
    try {
        const {
            username, link, groupName, bugType, bugName,
            payload, delay, severity, logId: existingLogId
        } = req.body;

        const userAgent = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

        logger.debug('Group WA execute:', { username, bugName, link: String(link).slice(0, 40) });

        if (!link || !payload || !bugType) {
            return res.status(400).json({ ok: false, error: 'link, payload, bugType wajib' });
        }

        if (!isValidWALink(link)) {
            return res.status(400).json({ ok: false, error: 'Invalid WhatsApp link' });
        }

        const payloadCheck = validatePayload(payload);
        if (!payloadCheck.ok) {
            return res.status(400).json({ ok: false, error: payloadCheck.error });
        }

        const rl = checkBugRateLimit(username || ip);
        if (!rl.ok) {
            return res.status(rl.code || 429).json({ ok: false, error: rl.error });
        }

        if (bugType) {
            try {
                const pSnap = await db.collection('bug_payloads').doc(bugType).get();
                if (pSnap.exists && pSnap.data().enabled === false) {
                    return res.status(400).json({ ok: false, error: 'Bug type disabled' });
                }
            } catch (e) { /* silent */ }
        }

        let logId = existingLogId;
        if (!logId) {
            logId = await logBugToFirestore({
                source: 'group_wa',
                username,
                bugName: bugName || bugType,
                bugId: bugType,
                category: 'group_wa',
                target: link, groupName,
                payload, delay, severity,
                status: 'sent', userAgent, ip
            });
        }

        const notifResult = await sendBugNotification({
            source: 'group_wa',
            username,
            bugName: bugName || bugType,
            bugId: bugType,
            category: 'group_wa',
            target: link, groupName,
            payload, delay, severity, userAgent
        });

        await sleep(delay || CONFIG.BUG_SIM_DELAY);

        if (logId) {
            try {
                await db.collection('bug_logs').doc(logId).update({
                    status: 'executed',
                    executedAt: FieldValue.serverTimestamp(),
                    executionResult: 'group_simulation_success',
                    notifDelivered: notifResult.ok,
                    notifMode: notifResult.mode
                });
            } catch (e) { /* silent */ }
        }

        res.json({
            ok: true,
            logId,
            message: 'Group bug dispatched',
            bugType,
            bugName,
            target: link,
            notif: {
                delivered: notifResult.ok,
                mode: notifResult.mode,
                error: notifResult.error || null
            },
            status: 'sent',
            time: new Date().toISOString()
        });

    } catch (e) {
        logger.error('Group bug error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.get('/bug/logs', requireApiKey, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const snap = await db.collection('bug_logs')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        const logs = [];
        snap.forEach(d => {
            const x = d.data();
            logs.push({
                id: d.id,
                username: x.username,
                bugName: x.bugName,
                target: x.target,
                hasPayload: x.hasPayload,
                payloadLength: x.payloadLength,
                status: x.status,
                createdAt: x.createdAt?.toDate?.()?.toISOString() || null
            });
        });

        res.json({ ok: true, count: logs.length, logs });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   ERROR HANDLERS
   ========================================================== */
process.on('uncaughtException', (e) => {
    logger.error('Uncaught Exception:', e);
});

process.on('unhandledRejection', (e) => {
    logger.error('Unhandled Rejection:', e);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down...');
    if (bot) bot.stopPolling();
    process.exit(0);
});

/* ==========================================================
   START SERVER
   ========================================================== */
const server = app.listen(CONFIG.PORT, () => {
    const notifChat = CONFIG.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT;

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   ⚔️  ZEYRON COMMAND BOT v9.0 ULTIMATE           ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║   🌐  Port       : ${String(CONFIG.PORT).padEnd(29)}║`);
    console.log(`║   💳  Provider   : ${CONFIG.PAYMENT_PROVIDER.padEnd(29)}║`);
    console.log(`║   🤖  Bot        : Active                        ║`);
    console.log(`║   🔥  Firebase   : Connected                     ║`);
    console.log(`║   🔍  Verbose    : ${(CONFIG.VERBOSE ? 'ON' : 'OFF').padEnd(29)}║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║   🎁  Custom User     : ENABLED                  ║');
    console.log('║   📦  Pool System     : ENABLED                  ║');
    console.log('║   🔐  Dual-Write      : ENABLED                  ║');
    console.log('║   👑  Multi-Role      : ENABLED                  ║');
    console.log('║   🐛  Bug Executor    : ENABLED                  ║');
    console.log('║   🔑  API Key Auth    : ENABLED                  ║');
    console.log('║   🚦  Rate Limiting   : ENABLED                  ║');
    console.log('║   📏  Payload Limit   : ENABLED                  ║');
    console.log('║   📨  Bug Notif       : ' +
        `${CONFIG.BUG_NOTIF_ENABLED ? '✅ ENABLED' : '🚫 DISABLED'}`.padEnd(23) + '║');
    console.log('║   💬  Notif Chat      : ' +
        `${notifChat || 'NOT SET'}`.slice(0, 23).padEnd(23) + '║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('📌 Commands:');
    console.log('   /generate /bulk /stock /accounts');
    console.log('   /checkuser /testlogin /fixuser /syncusers /diag');
    console.log('   /stats /broadcast /roles');
    console.log('');
    console.log('🐛 Bug Commands:');
    console.log('   /bugstats /bugrecent /bugnotif');
    console.log('   /bugtest /bugsetup /setbugchat /bugdebug /bughelp');
    console.log('');
    console.log('🔐 Security:');
    console.log('   API Key  : ' + (CONFIG.BUG_API_KEY ? '✅ Set' : '❌ Kosong'));
    console.log('   Rate Lim : ' + CONFIG.BUG_RATE_LIMIT.perMinute + '/min, ' +
                                   CONFIG.BUG_RATE_LIMIT.perHour + '/jam');
    console.log('');
});
