/* ==========================================================
   ZEYRON COMMAND — BOT TELEGRAM v7.1 FINAL
   File: bot.js
   
   FITUR v7.1:
   • Custom username & password di /generate
   • Dual-write fields (wallet+balance, expires+expired)
   • Akun generate LANGSUNG login di index.html
   • Auto-validation username unik
   • Commands: /checkuser /testlogin /syncusers /fixuser /diag
   • Fix bug /bulk sendDocument
   ========================================================== */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const cors = require('cors');
const crypto = require('crypto');

/* ==========================================================
   CONFIG
   ========================================================== */
const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '8929798096:AAFrynjFbR9ejXt_N2kvnGSe4xv5sNbCXb8',
    OWNER_ID: parseInt(process.env.OWNER_ID || '8790176339'),
    ADMIN_CHAT: parseInt(process.env.ADMIN_CHAT || '-1004425930502'),

    PORT: process.env.PORT || 3000,
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',

    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'demo',
    PAYMENT_API_KEY: process.env.PAYMENT_API_KEY || '',
    PAYMENT_PROJECT: process.env.PAYMENT_PROJECT || 'zeyron-command',
    PAYMENT_MERCHANT: process.env.PAYMENT_MERCHANT || 'ZEYRON COMMAND',

    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'zeyron_secret_2026',
    SERVICE_ACCOUNT_PATH: process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
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
        console.log('🔥 Firebase: BASE64 from env');
    } else {
        serviceAccount = require(CONFIG.SERVICE_ACCOUNT_PATH);
        console.log('🔥 Firebase: Local file');
    }

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
    FieldValue = admin.firestore.FieldValue;
    Timestamp = admin.firestore.Timestamp;

    console.log('✅ Firebase Admin connected');
    console.log('📌 Project ID  :', serviceAccount.project_id);
    console.log('📌 Client Email:', serviceAccount.client_email);
    console.log('⚠️  Pastikan projectId di index.html SAMA dengan ini!');
} catch (e) {
    console.error('❌ Firebase init error:', e.message);
    process.exit(1);
}

/* ==========================================================
   TELEGRAM BOT INIT
   ========================================================== */
let bot;
try {
    bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
    console.log('🤖 Bot Telegram connected');
} catch (e) {
    console.error('❌ Bot init error:', e.message);
    process.exit(1);
}

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
   🆕 VALIDATORS — untuk custom username & password
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

async function isUsernameTaken(username) {
    if (!username) return false;
    const u = String(username).trim().toLowerCase();

    // Cek di users collection
    try {
        const userSnap = await db.collection('users').doc(username).get();
        if (userSnap.exists) return true;

        // Cek variasi case
        const q = await db.collection('users')
            .where('username', '==', username).limit(1).get();
        if (!q.empty) return true;

        // Cek di pool juga
        const poolQ = await db.collection('account_pool')
            .where('username', '==', username).limit(1).get();
        if (!poolQ.empty) return true;
    } catch (e) {
        console.warn('isUsernameTaken error:', e.message);
    }
    return false;
}

/* ==========================================================
   🔥 CORE BUILDER — userData COMPATIBLE (index.html + home.html)
   Menulis DUA format sekaligus agar bisa login di mana saja.
   ========================================================== */
function buildUserData(params) {
    const {
        username, password, role, expires,
        typeId, typeName, days, generatedBy,
        source = 'bot_generator'
    } = params;

    // Normalisasi expired (home.html Part 3)
    const expiredVal = (expires === 'never' || !expires) ? null : expires;

    return {
        /* IDENTITY */
        username,
        password,
        role,                       // 'premium' | 'reseller' | 'admin' | 'owner'

        /* MASA AKTIF (DUAL) */
        expires,                    // index.html: 'never' | 'YYYY-MM-DD'
        expired: expiredVal,        // home.html: null | 'YYYY-MM-DD'

        /* SALDO (DUAL) */
        wallet: 0,
        balance: 0,

        /* PROFILE */
        avatar: '',
        email: '',
        phone: '',

        /* STATUS */
        banned: false,
        banReason: '',

        /* METADATA (DUAL) */
        createdAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),

        /* EXTRA */
        type: typeId,
        typeName: typeName,
        days: days || null,
        generatedBy: generatedBy || 'system',
        source,
        referral: 'REF-' + String(username).slice(0, 4).toUpperCase() +
                  crypto.randomBytes(2).toString('hex').toUpperCase(),

        /* GAME DATA */
        themes: [],
        achievements: [],
        exp: 0,
        additionalRoles: [],

        /* TIMESTAMPS */
        lastSeen: new Date().toISOString(),
        roleUpdatedAt: new Date().toISOString(),

        /* FLAG */
        loginReady: true
    };
}

/* ==========================================================
   ACCOUNT GENERATOR v7.1 (dengan custom username/password)
   
   @param typeId       - 'member' | 'permanent' | dst
   @param days         - durasi hari (untuk member)
   @param generatedBy  - siapa yang generate
   @param customUser   - (opsional) username custom
   @param customPass   - (opsional) password custom
   ========================================================== */
async function generateAccount(typeId, days, generatedBy = 'system', customUser = null, customPass = null) {
    const type = ACCOUNT_TYPES[typeId];
    if (!type) throw new Error(`Tipe "${typeId}" tidak valid`);

    // Validasi durasi
    if (type.needsDuration) {
        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            throw new Error(`Durasi harus ${type.minDays}-${type.maxDays} hari`);
        }
    }

    /* ===== CUSTOM USERNAME VALIDATION ===== */
    let username;
    if (customUser) {
        const v = validateUsername(customUser);
        if (!v.ok) throw new Error('Username: ' + v.error);

        const taken = await isUsernameTaken(v.value);
        if (taken) throw new Error(`Username "${v.value}" sudah dipakai`);

        username = v.value;
    } else {
        // Generate random, pastikan tidak bentrok
        let attempts = 0;
        do {
            username = generateUsername(typeId);
            attempts++;
        } while (await isUsernameTaken(username) && attempts < 10);
    }

    /* ===== CUSTOM PASSWORD VALIDATION ===== */
    let password;
    if (customPass) {
        const v = validatePassword(customPass);
        if (!v.ok) throw new Error('Password: ' + v.error);
        password = v.value;
    } else {
        password = generatePassword(10);
    }

    const expiresAt = calculateExpiry(typeId, days);

    let expires;
    if (type.permanent || !expiresAt) {
        expires = 'never';
    } else {
        expires = expiresAt.toDate().toISOString().slice(0, 10);
    }

    /* ===== 1. SIMPAN KE POOL ===== */
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

    /* ===== 2. SIMPAN KE USERS ===== */
    const userData = buildUserData({
        username, password,
        role: type.loginRole,
        expires,
        typeId,
        typeName: type.name,
        days: type.needsDuration ? parseInt(days) : null,
        generatedBy,
        source: 'bot_generator'
    });

    await db.collection('users').doc(username).set(userData);

    console.log(`✅ Generated: ${username} | ${type.name} | role=${type.loginRole} | exp=${expires}`);

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

        console.log(`📦 Claimed: ${data.username} → ${telegram}`);

        return {
            username: data.username,
            password: data.password,
            type: data.type,
            typeName: data.typeName,
            expiresAt: data.expiresAt,
            fromPool: true
        };
    }

    // Pool kosong → auto-generate
    console.log(`⚡ Pool kosong [${typeId}] — auto-generate`);

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
   🆕 SEND ACCOUNT TO TELEGRAM (reusable)
   ========================================================== */
async function sendAccountMessage(chatId, acc, extra = {}) {
    const expText = acc.expiresAt
        ? acc.expiresAt.toDate().toLocaleString('id-ID')
        : (acc.expires === 'never' || acc.permanent ? '♾️ Permanent' : '-');

    const durText = acc.days
        ? `${acc.days} hari`
        : (acc.permanent ? 'Permanent' : '-');

    const customTag = acc.isCustom ? '\n🎨 *CUSTOM* oleh owner' : '';

    let text = `✅ *AKUN SIAP LOGIN*${customTag}\n\n`;
    text += `📦 Tipe: *${acc.typeName}*\n`;
    text += `🎭 Role Login: \`${acc.role}\`\n`;
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
   BOT COMMANDS — USER
   ========================================================== */

bot.onText(/\/start/, (msg) => {
    const name = msg.from.first_name || 'User';
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
    );
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
        text += `• /checkuser \\<username\\> — Cek bisa login\n`;
        text += `• /testlogin \\<user\\> \\<pass\\> — Simulasi login\n`;
        text += `• /fixuser \\<username\\> — Fix 1 akun\n`;
        text += `• /syncusers — Fix semua akun lama\n`;
        text += `• /deleteaccount \\<username\\>\n`;
        text += `• /clearused — Clear akun terpakai\n`;
        text += `• /migratepool — Migrate pool ke users\n`;
        text += `• /stats — Statistik\n`;
        text += `• /diag — Diagnostik Firebase\n`;
        text += `• /broadcast \\<pesan\\>\n`;
    }

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
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
    text += `*Contoh Generate:*\n`;
    text += `• \`/generate member 7\` (random)\n`;
    text += `• \`/generate member 7 myuser mypass\` (custom)\n`;
    text += `• \`/generate permanent premiumku pass123\`\n`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
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
            t += `*${i + 1}. ${x.invoice}*\n`;
            t += `   ${x.roleName}\n   ${st} • ${rupiah(x.total)}\n   📅 ${date}\n\n`;
        });
        bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Riwayat error:', e);
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
            t += `${m} ${u}\n    💰 ${rupiah(v)}\n\n`;
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
    );
});

bot.onText(/\/download/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `📱 *Download APK Zeyron Command*\n\n` +
        `🔗 MediaFire: https://www.mediafire.com/file/zeyron-command-app\n\n` +
        `⚠️ Install dari sumber terpercaya!`,
        { parse_mode: 'Markdown' }
    );
});

/* ==========================================================
   BOT COMMANDS — ADMIN (Owner only)
   ========================================================== */

/* ---------- /generate — DENGAN CUSTOM USERNAME/PASSWORD ---------- */
bot.onText(/\/generate\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Hanya Developer');
    }

    const typeId = match[1].toLowerCase();
    const arg2 = match[2] || null;   // bisa jadi hari ATAU username
    const arg3 = match[3] || null;   // password atau hari
    const arg4 = match[4] || null;   // password

    const type = ACCOUNT_TYPES[typeId];
    if (!type) {
        return bot.sendMessage(msg.chat.id,
            `❌ Tipe \`${typeId}\` tidak valid\n\nGunakan /roles`,
            { parse_mode: 'Markdown' }
        );
    }

    // Parse argumen: kalau butuh durasi, arg2 = hari
    let days = null;
    let customUser = null;
    let customPass = null;

    if (type.needsDuration) {
        // Format: /generate member <hari> [user] [pass]
        days = arg2;
        customUser = arg3;
        customPass = arg4;

        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ *${type.name}* wajib isi durasi ${type.minDays}-${type.maxDays} hari\n\n` +
                `Format:\n` +
                `• \`/generate ${typeId} 7\` (random)\n` +
                `• \`/generate ${typeId} 7 userku passku\` (custom)`,
                { parse_mode: 'Markdown' }
            );
        }
    } else {
        // Format: /generate permanent [user] [pass]
        customUser = arg2;
        customPass = arg3;

        // Kalau arg2 ternyata angka dan arg3 bukan, kemungkinan user pakai format lama
        if (arg2 && !isNaN(parseInt(arg2)) && !arg3) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ *${type.name}* tidak butuh durasi\n\n` +
                `Format:\n` +
                `• \`/generate ${typeId}\` (random)\n` +
                `• \`/generate ${typeId} userku passku\` (custom)`,
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
        console.error('Generate error:', e);
        bot.sendMessage(msg.chat.id, `❌ *Gagal generate*\n\n${e.message}`, { parse_mode: 'Markdown' });
    }
});

/* ---------- /bulk — massal (selalu random) ---------- */
bot.onText(/\/bulk\s+(\d+)\s+(\S+)(?:\s+(\d+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const count = parseInt(match[1]);
    const typeId = match[2].toLowerCase();
    const days = match[3] || null;
    const type = ACCOUNT_TYPES[typeId];

    if (!type) {
        return bot.sendMessage(msg.chat.id, `❌ Tipe \`${typeId}\` tidak valid`, { parse_mode: 'Markdown' });
    }

    if (count < 1 || count > 100) {
        return bot.sendMessage(msg.chat.id, '❌ Jumlah 1-100');
    }

    if (type.needsDuration) {
        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ Untuk ${type.name}, wajib isi durasi ${type.minDays}-${type.maxDays}\n\n` +
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
                        `⏳ Progress: *${i + 1}/${count}* akun dibuat...`,
                        { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
        }

        if (count <= 10) {
            let t = `✅ *${count} AKUN DIBUAT*\n\n`;
            t += `📦 Tipe: *${type.name}*\n`;
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
            // CSV file
            const csv = accounts.map(a =>
                `${a.username}|${a.password}|${a.type}|${days || 'permanent'}`
            ).join('\n');

            // Kirim sebagai text file
            await bot.sendDocument(msg.chat.id,
                Buffer.from(csv, 'utf8'),
                {
                    caption: `✅ ${count} akun ${type.name} (${days ? days + ' hari' : 'permanent'})\n🔐 Login di index.html`
                },
                {
                    filename: `accounts_${typeId}_${Date.now()}.txt`,
                    contentType: 'text/plain'
                }
            );

            await bot.editMessageText(
                `✅ *${count} akun* berhasil dibuat & dikirim file`,
                { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
            );
        }
    } catch (e) {
        console.error('Bulk error:', e);
        bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
});

/* ---------- /stock ---------- */
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

/* ---------- /accounts [type] ---------- */
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
            t += `${icon} \`${x.username}\` — ${x.typeName}\n`;
        });
        t += `\n_Total: ${snap.size}_`;
        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ---------- 🆕 /checkuser ---------- */
bot.onText(/\/checkuser\s+(\S+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const username = match[1];

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const ref = db.collection('users').doc(username);
        const snap = await ref.get();

        if (!snap.exists) {
            // Coba query
            const q = await db.collection('users').where('username', '==', username).limit(1).get();
            if (q.empty) {
                return bot.sendMessage(msg.chat.id,
                    `❌ *Akun TIDAK ADA*\n\n\`${username}\` tidak ditemukan di collection users.\n\n` +
                    `Kemungkinan:\n` +
                    `• Bot belum pernah generate\n` +
                    `• Sudah dihapus\n` +
                    `• Firebase project beda`,
                    { parse_mode: 'Markdown' }
                );
            }
        }

        const data = (snap.exists ? snap.data() : (await db.collection('users').where('username', '==', username).limit(1).get()).docs[0].data());

        // Cek field yang dibutuhkan index.html & home.html
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
        t += `\n${allOk ? '🔐 *SIAP LOGIN* di index.html' : '⚠️ Jalankan /fixuser ' + username}`;

        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ---------- 🆕 /testlogin ---------- */
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
            return bot.sendMessage(msg.chat.id, `❌ Password salah\n\nTersimpan: \`${data.password}\`\nInput: \`${password}\``, { parse_mode: 'Markdown' });
        }

        if (data.banned === true) {
            return bot.sendMessage(msg.chat.id, `🚫 Akun di-BANNED: ${data.banReason || '-'}`, { parse_mode: 'Markdown' });
        }

        // Cek expired
        const exp = data.expires || data.expired;
        let expStatus = '✅ Lifetime';
        if (exp && exp !== 'never') {
            const dt = new Date(exp);
            if (dt < new Date()) {
                expStatus = '❌ EXPIRED';
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
            `🔐 Akun ini *BISA LOGIN* di index.html ✅`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ---------- 🆕 /fixuser ---------- */
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

        // Fix dual fields
        if (typeof data.wallet === 'number' && typeof data.balance !== 'number') {
            patch.balance = data.wallet;
        }
        if (typeof data.balance === 'number' && typeof data.wallet !== 'number') {
            patch.wallet = data.balance;
        }
        if (data.expires && !('expired' in data)) {
            patch.expired = data.expires === 'never' ? null : data.expires;
        }
        if (data.expired !== undefined && !data.expires) {
            patch.expires = data.expired || 'never';
        }
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
            return bot.sendMessage(msg.chat.id, `✅ \`${username}\` sudah OK, tidak perlu fix`, { parse_mode: 'Markdown' });
        }

        await ref.update(patch);

        let t = `✅ *FIXED:* \`${username}\`\n\n*Field ditambahkan/diperbaiki:*\n`;
        for (const k of Object.keys(patch)) t += `• \`${k}\`\n`;
        t += `\n🔐 Sekarang akun ini *BISA LOGIN* di index.html`;

        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ---------- 🆕 /syncusers — Fix semua akun lama ---------- */
bot.onText(/\/syncusers/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const statusMsg = await bot.sendMessage(msg.chat.id, '⏳ Scanning semua user...');

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
            } catch (e) {
                failed++;
            }
        }

        let t = `✅ *SYNC COMPLETE*\n\n`;
        t += `📊 Total user: *${snap.size}*\n`;
        t += `✅ Sudah OK: *${ok}*\n`;
        t += `🔧 Diperbaiki: *${fixed}*\n`;
        t += `❌ Gagal: *${failed}*\n\n`;
        if (fixes.length) {
            t += `*Contoh yang diperbaiki:*\n`;
            fixes.forEach(f => { t += `• \`${f}\`\n`; });
        }
        t += `\n💡 Semua user sekarang *BISA LOGIN* di index.html`;

        await bot.editMessageText(t, {
            chat_id: msg.chat.id,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
        });
    } catch (e) {
        console.error('syncusers error:', e);
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ---------- 🆕 /diag — Diagnostik Firebase ---------- */
bot.onText(/\/diag/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        // Test 1: Read users count
        const usersSnap = await db.collection('users').limit(1).get();
        const usersCount = (await db.collection('users').get()).size;

        // Test 2: Read pool count
        const poolCount = (await db.collection('account_pool').get()).size;

        // Test 3: Check bot identity
        const botInfo = await bot.getMe();

        let t = `🔍 *DIAGNOSTIK SISTEM*\n━━━━━━━━━━━━━━━━━━\n\n`;
        t += `*Firebase:*\n`;
        t += `✅ Connected\n`;
        t += `👥 Users: *${usersCount}*\n`;
        t += `📦 Pool: *${poolCount}*\n\n`;
        t += `*Bot:*\n`;
        t += `✅ @${botInfo.username}\n`;
        t += `🆔 ${botInfo.id}\n\n`;
        t += `*Owner:*\n`;
        t += `🆔 \`${CONFIG.OWNER_ID}\`\n`;
        t += `✅ Verified: ${msg.from.id === CONFIG.OWNER_ID ? 'YES' : 'NO'}\n\n`;
        t += `*Sample user (first):*\n`;
        if (usersSnap.size > 0) {
            const sample = usersSnap.docs[0];
            const d = sample.data();
            t += `👤 \`${sample.id}\`\n`;
            t += `🎭 Role: ${d.role}\n`;
            t += `🔑 Has password: ${!!d.password}\n`;
            t += `💰 Balance: ${d.balance || d.wallet || 0}\n`;
            t += `📅 Expires: ${d.expires || d.expired || '-'}\n`;
            t += `🚫 Banned: ${d.banned ? 'YES' : 'NO'}\n`;
        } else {
            t += `_Belum ada user_\n`;
        }

        t += `\n*Waktu:* ${new Date().toLocaleString('id-ID')}`;

        bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('diag error:', e);
        bot.sendMessage(msg.chat.id, '❌ Diag error: ' + e.message);
    }
});

/* ---------- /deleteaccount ---------- */
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

/* ---------- /clearused ---------- */
bot.onText(/\/clearused/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        const snap = await db.collection('account_pool').where('status', '==', 'used').get();
        if (snap.empty) return bot.sendMessage(msg.chat.id, '📭 Tidak ada akun terpakai');

        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        bot.sendMessage(msg.chat.id, `✅ ${snap.size} akun terpakai dihapus dari pool`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

/* ---------- /migratepool ---------- */
bot.onText(/\/migratepool/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const statusMsg = await bot.sendMessage(msg.chat.id, '⏳ Migrating pool ke users...');

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
                console.error(`Failed migrate ${username}:`, e);
                failed++;
            }
        }

        await bot.editMessageText(
            `✅ *MIGRASI SELESAI*\n\n` +
            `📦 Total pool: ${snap.size}\n` +
            `✅ Migrated: *${migrated}*\n` +
            `⏭️ Skipped: *${skipped}*\n` +
            `❌ Failed: *${failed}*\n\n` +
            `Semua akun sekarang *BISA LOGIN* di index.html ✅`,
            { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('Migration error:', e);
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

/* ---------- /stats ---------- */
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

/* ---------- /broadcast ---------- */
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
   EXPRESS SERVER
   ========================================================== */
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'Zeyron Command Bot',
        version: '7.1.0',
        features: ['order', 'payment', 'account-generator', 'custom-user', 'pool-system', 'multi-role'],
        time: new Date().toISOString()
    });
});

/* ==================== ORDER ==================== */
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
            `📦 *Detail Akun Zeyron Command*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🎯 Tipe: *${acc.typeName || role}*\n` +
            `⏳ Durasi: *${duration}*\n` +
            `📅 Expired: ${expText}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 Username: \`${acc.username}\`\n` +
            `🔑 Password: \`${acc.password}\`\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🧾 Invoice: \`${invoice}\`\n` +
            `💰 Total: *${rupiah(total)}*\n\n` +
            `⚠️ _Jangan bagikan data ini!_`;

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
                `🎯 ${acc.typeName || role}\n` +
                `👤 \`${acc.username}\`\n` +
                `💰 ${rupiah(total)}\n` +
                `📬 ${delivered ? '✅' : '❌'}\n` +
                `📍 ${acc.fromPool ? 'pool' : 'auto-gen'}`,
                { parse_mode: 'Markdown' }
            ).catch(() => {});
        }

        res.json({ ok: true, invoice, username: acc.username, fromPool: acc.fromPool, delivered });
    } catch (e) {
        console.error('Order error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== PAYMENT CREATE ==================== */
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
                console.warn('Pakasir error, fallback demo:', e.message);
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
        console.error('Create payment error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== PAYMENT CHECK ==================== */
app.get('/payment/check/:invoice', async (req, res) => {
    try {
        const snap = await db.collection('topups').doc(req.params.invoice).get();
        if (!snap.exists) return res.json({ ok: true, status: 'not_found' });
        res.json({ ok: true, status: snap.data().status, data: snap.data() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== PAYMENT WEBHOOK ==================== */
app.post('/payment/webhook', async (req, res) => {
    try {
        const body = req.body;
        console.log('💳 Webhook:', JSON.stringify(body));

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

                // Update dual field
                await userRef.update({
                    wallet: newSaldo,
                    balance: newSaldo,
                    lastTopup: new Date().toISOString()
                });

                console.log(`✅ Topup: ${topup.username} +${rupiah(topup.amount)}`);

                if (user.telegram) {
                    const tgId = String(user.telegram).replace(/[^0-9]/g, '') ||
                                 String(user.telegram).replace('@', '');
                    bot.sendMessage(tgId,
                        `💰 *TOP-UP BERHASIL*\n\n` +
                        `💵 Nominal: *${rupiah(topup.amount)}*\n` +
                        `🧾 Invoice: \`${invoice}\`\n` +
                        `💳 Saldo Baru: *${rupiah(newSaldo)}*`,
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
        console.error('Webhook error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== API: GENERATE ==================== */
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
            // Kalau count=1 dan ada custom, pakai custom
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

/* ==================== DEV LOGIN ==================== */
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

/* ==================== DEV CHANGE PASSWORD ==================== */
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

/* ==================== DEV DISCOUNT ==================== */
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

/* ==================== DEV SETTINGS ==================== */
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

/* ==================== BUY ROLE ==================== */
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
        console.error('Buy role error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== REDEEM BUY ==================== */
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
        console.error('Redeem buy error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== REDEEM USE ==================== */
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
        console.error('Redeem use error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== BUY THEME ==================== */
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
        console.error('Buy theme error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   ERROR HANDLERS
   ========================================================== */
process.on('uncaughtException', (e) => {
    console.error('❌ Uncaught Exception:', e);
});

process.on('unhandledRejection', (e) => {
    console.error('❌ Unhandled Rejection:', e);
});

process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    if (bot) bot.stopPolling();
    process.exit(0);
});

/* ==========================================================
   START SERVER
   ========================================================== */
/* ==========================================================
   UNIVERSAL BUG EXECUTOR + TELEGRAM NOTIF v1.0
   Tempel SEBELUM: const server = app.listen(...)
   ========================================================== */

const BUG_EXEC_CONFIG = {
    /* Chat ID admin penerima notif bug — ganti sesuai kebutuhan */
    NOTIF_CHAT: process.env.BUG_NOTIF_CHAT || CONFIG.ADMIN_CHAT,
    
    /* Aktif/nonaktif notif Telegram */
    notifEnabled: true,
    
    /* Simulasi delay (ms) — ganti kalau sudah ada eksekutor real */
    simDelay: 800
};

/* ==========================================================
   HELPER: Format pesan Telegram
   ========================================================== */
function formatBugNotif(data) {
    const {
        source,           // 'direct' | 'group_wa'
        username,
        bugName,
        bugId,
        category,
        target,
        groupName,
        payload,
        delay,
        severity,
        userAgent,
        ip
    } = data;

    const now = new Date();
    const timeStr = now.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }) + ' WIB';

    const emoji = source === 'group_wa' ? '💬' : '💥';
    const title = source === 'group_wa' ? 'BUG GROUP WA' : 'BUG ' + (category || '').toUpperCase();

    /* ==== Info Target ==== */
    let targetInfo = '';
    if (source === 'group_wa') {
        targetInfo = `🔗 *Link Grup:*\n\`${target}\``;
        if (groupName) targetInfo += `\n📝 *Nama Grup:* ${groupName}`;
    } else {
        targetInfo = `📱 *Nomor Target:*\n\`${target}\``;
    }

    /* ==== Info Payload ==== */
    const hasPayload = payload && payload.trim().length > 0;
    const payloadLen = hasPayload ? payload.length : 0;
    const payloadPreview = hasPayload
        ? payload.slice(0, 350).replace(/`/g, '\'')
        : '❌ *TIDAK ADA PAYLOAD*';

    const payloadTruncated = hasPayload && payload.length > 350;

    /* ==== Build Message ==== */
    let msg = '';
    msg += `${emoji} *${title}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n\n`;

    /* User */
    msg += `👤 *User:* \`${escapeMarkdown(username || 'unknown')}\`\n`;
    msg += `🎯 *Bug:* ${escapeMarkdown(bugName || '-')}\n`;
    if (bugId) msg += `🔖 *Bug ID:* \`${bugId}\`\n`;
    if (severity) msg += `⚠️ *Severity:* ${String(severity).toUpperCase()}\n`;
    if (delay) msg += `⏱️ *Delay:* ${delay}ms\n`;
    msg += `\n`;

    /* Target */
    msg += `${targetInfo}\n\n`;

    /* Timestamp */
    msg += `🕐 *Waktu:* ${timeStr}\n\n`;

    /* Payload */
    msg += `📦 *PAYLOAD* ${hasPayload ? `(${payloadLen} chars)` : ''}:\n`;
    msg += `\`\`\`\n${payloadPreview}${payloadTruncated ? '\n... (truncated)' : ''}\n\`\`\`\n`;

    /* Status */
    const statusIcon = hasPayload ? '✅' : '⚠️';
    const statusText = hasPayload ? 'SIAP DIEKSEKUSI' : 'PAYLOAD KOSONG';
    msg += `\n${statusIcon} *Status:* ${statusText}\n`;

    /* User Agent */
    if (userAgent) {
        msg += `\n🌐 *Client:* \`${String(userAgent).slice(0, 60)}\``;
    }

    return msg;
}

function escapeMarkdown(str) {
    return String(str || '').replace(/[_*`\[\]()]/g, '\\$&');
}

/* ==========================================================
   KIRIM NOTIF KE TELEGRAM
   ========================================================== */
async function sendBugNotification(data) {
    if (!BUG_EXEC_CONFIG.notifEnabled) return;
    if (!BUG_EXEC_CONFIG.NOTIF_CHAT) {
        console.warn('⚠️ BUG_NOTIF_CHAT tidak diset, skip notif');
        return;
    }

    try {
        const msg = formatBugNotif(data);
        await bot.sendMessage(BUG_EXEC_CONFIG.NOTIF_CHAT, msg, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        console.log('📨 Notif bug terkirim ke Telegram');
        return true;
    } catch (e) {
        console.error('❌ Gagal kirim notif:', e.message);
        /* Fallback: kirim tanpa Markdown kalau format error */
        try {
            const plain = `BUG MASUK\n\nUser: ${data.username}\nBug: ${data.bugName}\nTarget: ${data.target}\nWaktu: ${new Date().toISOString()}\nPayload Length: ${(data.payload || '').length}`;
            await bot.sendMessage(BUG_EXEC_CONFIG.NOTIF_CHAT, plain);
            return true;
        } catch (e2) {
            console.error('❌ Gagal fallback notif:', e2.message);
            return false;
        }
    }
}

/* ==========================================================
   LOG KE FIRESTORE
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
        console.error('Firestore log error:', e.message);
        return null;
    }
}

/* ==========================================================
   ENDPOINT: /bug/execute  (Crash / Freeze / Spam)
   ========================================================== */
app.post('/bug/execute', async (req, res) => {
    try {
        const {
            username,
            target,
            bugName,
            bugId,
            payload,
            category,
            delay,
            severity
        } = req.body;

        const userAgent = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

        console.log('🎯 Bug execute:', {
            username,
            bugName,
            target: String(target || '').slice(0, 20),
            hasPayload: !!(payload && payload.trim()),
            payloadLen: (payload || '').length
        });

        /* ==== VALIDASI ==== */
        if (!target || !bugName) {
            return res.status(400).json({
                ok: false,
                error: 'Missing fields: target & bugName wajib'
            });
        }

        if (!payload || !payload.trim()) {
            /* Tetap kirim notif walau payload kosong, tapi beri warning */
            console.warn('⚠️ Bug tanpa payload');
        }

        /* ==== 1. LOG KE FIRESTORE ==== */
        const logId = await logBugToFirestore({
            source: 'direct',
            username,
            bugName,
            bugId,
            category,
            target,
            payload,
            delay,
            severity,
            status: 'sent',
            userAgent,
            ip
        });

        /* ==== 2. KIRIM NOTIF TELEGRAM ==== */
        await sendBugNotification({
            source: 'direct',
            username,
            bugName,
            bugId,
            category,
            target,
            payload,
            delay,
            severity,
            userAgent
        });

        /* ==== 3. SIMULASI EKSEKUSI ==== */
        await new Promise(r => setTimeout(r, BUG_EXEC_CONFIG.simDelay));

        /* ================================================
           ⚠️ DI SINI TEMPAT EKSEKUSI REAL
           Contoh:
           - Kirim via Baileys
           - Kirim via WA API
           - Custom script
           ================================================ */

        /* ==== 4. UPDATE LOG (kalau logId ada) ==== */
        if (logId) {
            try {
                await db.collection('bug_logs').doc(logId).update({
                    status: 'executed',
                    executedAt: FieldValue.serverTimestamp(),
                    executionResult: 'simulation_success'
                });
            } catch (e) { /* silent */ }
        }

        /* ==== 5. RESPON ==== */
        res.json({
            ok: true,
            logId,
            message: 'Bug dispatched',
            bugName,
            target,
            hasPayload: !!(payload && payload.trim()),
            status: 'sent',
            time: new Date().toISOString()
        });

    } catch (e) {
        console.error('❌ Bug execute error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   ENDPOINT: /bug/group/execute  (Group WA)
   ========================================================== */
app.post('/bug/group/execute', async (req, res) => {
    try {
        const {
            username,
            link,
            groupName,
            bugType,
            bugName,
            payload,
            delay,
            severity,
            logId: existingLogId
        } = req.body;

        const userAgent = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

        console.log('💬 Group WA execute:', {
            username,
            bugName,
            link: String(link || '').slice(0, 40),
            hasPayload: !!(payload && payload.trim())
        });

        /* ==== VALIDASI ==== */
        if (!link || !payload || !bugType) {
            return res.status(400).json({
                ok: false,
                error: 'Missing fields: link, payload, bugType wajib'
            });
        }

        if (!/chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(link) &&
            !/wa\.me\/[A-Za-z0-9]+/i.test(link)) {
            return res.status(400).json({
                ok: false,
                error: 'Invalid WhatsApp link'
            });
        }

        /* ==== Cek payload di Firestore (validasi) ==== */
        if (bugType) {
            try {
                const pSnap = await db.collection('bug_payloads').doc(bugType).get();
                if (pSnap.exists) {
                    const pData = pSnap.data();
                    if (pData.enabled === false) {
                        return res.status(400).json({
                            ok: false,
                            error: 'Bug type dinonaktifkan oleh developer'
                        });
                    }
                }
            } catch (e) { /* silent */ }
        }

        /* ==== 1. LOG KE FIRESTORE ==== */
        let logId = existingLogId;
        if (!logId) {
            logId = await logBugToFirestore({
                source: 'group_wa',
                username,
                bugName: bugName || bugType,
                bugId: bugType,
                category: 'group_wa',
                target: link,
                groupName,
                payload,
                delay,
                severity,
                status: 'sent',
                userAgent,
                ip
            });
        } else {
            /* Update log yang sudah ada */
            try {
                await db.collection('bug_logs').doc(logId).update({
                    status: 'processing',
                    processedAt: FieldValue.serverTimestamp()
                });
            } catch (e) { /* silent */ }
        }

        /* ==== 2. NOTIF TELEGRAM ==== */
        await sendBugNotification({
            source: 'group_wa',
            username,
            bugName: bugName || bugType,
            bugId: bugType,
            category: 'group_wa',
            target: link,
            groupName,
            payload,
            delay,
            severity,
            userAgent
        });

        /* ==== 3. SIMULASI ==== */
        await new Promise(r => setTimeout(r, delay || BUG_EXEC_CONFIG.simDelay));

        /* ================================================
           ⚠️ EKSEKUSI REAL DI SINI
           ================================================ */

        /* ==== 4. UPDATE LOG ==== */
        if (logId) {
            try {
                await db.collection('bug_logs').doc(logId).update({
                    status: 'executed',
                    executedAt: FieldValue.serverTimestamp(),
                    executionResult: 'group_simulation_success'
                });
            } catch (e) { /* silent */ }
        }

        /* ==== 5. RESPON ==== */
        res.json({
            ok: true,
            logId,
            message: 'Group bug dispatched',
            bugType,
            bugName,
            target: link,
            status: 'sent',
            time: new Date().toISOString()
        });

    } catch (e) {
        console.error('❌ Group bug error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==========================================================
   ENDPOINT: GET /bug/logs  (lihat riwayat, opsional)
   ========================================================== */
app.get('/bug/logs', async (req, res) => {
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
   BOT COMMAND: /bugstats — cek statistik bug
   ========================================================== */
bot.onText(/\/bugstats/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const snap = await db.collection('bug_logs').get();
        const stats = {
            total: snap.size,
            direct: 0,
            group_wa: 0,
            withPayload: 0,
            withoutPayload: 0,
            byBug: {}
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

        /* Top 5 bugs */
        const topBugs = Object.entries(stats.byBug)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        let text = `🐛 *BUG STATISTICS*\n━━━━━━━━━━━━━━━━━━\n\n`;
        text += `📊 Total: *${stats.total}*\n`;
        text += `💥 Direct: *${stats.direct}*\n`;
        text += `💬 Group WA: *${stats.group_wa}*\n\n`;
        text += `📦 With Payload: *${stats.withPayload}*\n`;
        text += `⚠️ Without Payload: *${stats.withoutPayload}*\n\n`;
        text += `🏆 *Top Bugs:*\n`;
        topBugs.forEach(([name, count], i) => {
            text += `${i + 1}. ${name} — *${count}x*\n`;
        });

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

/* ==========================================================
   BOT COMMAND: /bugrecent — 10 bug terakhir
   ========================================================== */
bot.onText(/\/bugrecent(?:\s+(\d+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const limit = Math.min(parseInt(match[1]) || 10, 30);

    try {
        bot.sendChatAction(msg.chat.id, 'typing');

        const snap = await db.collection('bug_logs')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        if (snap.empty) {
            return bot.sendMessage(msg.chat.id, '📭 Belum ada log bug');
        }

        let text = `🐛 *${limit} BUG TERAKHIR*\n━━━━━━━━━━━━━━━━━━\n\n`;
        let idx = 1;

        snap.forEach(d => {
            const x = d.data();
            const time = x.createdAt?.toDate
                ? x.createdAt.toDate().toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit'
                })
                : '-';
            const payloadIcon = x.hasPayload ? '✅' : '⚠️';
            const sourceIcon = x.source === 'group_wa' ? '💬' : '💥';

            text += `*${idx++}.* ${sourceIcon} ${x.bugName || '-'}\n`;
            text += `   👤 \`${x.username || '-'}\`\n`;
            text += `   🎯 \`${String(x.target || '-').slice(0, 30)}\`\n`;
            text += `   ${payloadIcon} Payload: ${x.payloadLength || 0} chars\n`;
            text += `   🕐 ${time}\n\n`;
        });

        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

/* ==========================================================
   BOT COMMAND: /bugnotif — toggle notifikasi bug
   ========================================================== */
bot.onText(/\/bugnotif(?:\s+(on|off))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const arg = match[1]?.toLowerCase();

    if (!arg) {
        const status = BUG_EXEC_CONFIG.notifEnabled ? '✅ ON' : '🚫 OFF';
        return bot.sendMessage(msg.chat.id,
            `🔔 *Bug Notif:* ${status}\n\n` +
            `Gunakan: \`/bugnotif on\` atau \`/bugnotif off\``,
            { parse_mode: 'Markdown' }
        );
    }

    BUG_EXEC_CONFIG.notifEnabled = (arg === 'on');
    bot.sendMessage(msg.chat.id,
        `🔔 Bug notif: *${BUG_EXEC_CONFIG.notifEnabled ? 'AKTIF' : 'NONAKTIF'}*`,
        { parse_mode: 'Markdown' }
    );
});

/* ==========================================================
   BOT COMMAND: /bugtest — test notif bug
   ========================================================== */
bot.onText(/\/bugtest/, async (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    await sendBugNotification({
        source: 'direct',
        username: 'test_user',
        bugName: 'Crash Force Close',
        bugId: 'crash_crash_force_close',
        category: 'crash',
        target: '628123456789',
        payload: `[TEST_PAYLOAD]\ntarget: 628123456789\nmethod: force_close\nintensity: 9\nnotes: Ini pesan test untuk cek notifikasi`,
        delay: 1500,
        severity: 'high',
        userAgent: 'Mozilla/5.0 (Test)'
    });

    bot.sendMessage(msg.chat.id, '✅ Test notif terkirim ke admin chat');
});

/* ==========================================================
   BOT COMMAND: /bughelp — bantuan
   ========================================================== */
bot.onText(/\/bughelp/, (msg) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const text = `🐛 *BUG COMMANDS*\n━━━━━━━━━━━━━━━━━━\n\n` +
        `• /bugstats — Statistik semua bug\n` +
        `• /bugrecent [n] — n bug terakhir (default 10)\n` +
        `• /bugnotif [on/off] — Toggle notifikasi bug\n` +
        `• /bugtest — Test kirim notif bug\n` +
        `• /bughelp — Bantuan ini\n\n` +
        `_Setiap user kirim bug → notif masuk otomatis_`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

/* ==========================================================
   STARTUP LOG
   ========================================================== */
console.log('');
console.log('🐛 ═══════════════════════════════════════════');
console.log('   UNIVERSAL BUG EXECUTOR v1.0');
console.log('   ───────────────────────────────────────');
console.log('   ✅ POST /bug/execute        (Crash/Freeze/Spam)');
console.log('   ✅ POST /bug/group/execute  (Group WA)');
console.log('   ✅ GET  /bug/logs           (Riwayat)');
console.log('   ✅ Telegram notif: ' + (BUG_EXEC_CONFIG.notifEnabled ? 'ON' : 'OFF'));
console.log('   ✅ Notif chat: ' + (BUG_EXEC_CONFIG.NOTIF_CHAT || '(belum diset)'));
console.log('   ───────────────────────────────────────');
console.log('   Bot commands:');
console.log('   /bugstats  /bugrecent  /bugnotif  /bugtest  /bughelp');
console.log('🐛 ═══════════════════════════════════════════');
console.log('');

const server = app.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   ⚔️  ZEYRON COMMAND BOT v7.1.0              ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║   🌐  Port      : ${String(CONFIG.PORT).padEnd(27)}║`);
    console.log(`║   💳  Provider  : ${CONFIG.PAYMENT_PROVIDER.padEnd(27)}║`);
    console.log(`║   🤖  Bot       : Active                     ║`);
    console.log(`║   🔥  Firebase  : Connected                  ║`);
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║   🎁  Custom User: ENABLED                   ║');
    console.log('║   📦  Pool System: ENABLED                   ║');
    console.log('║   🔐  Dual-Write: ENABLED                    ║');
    console.log('║   👑  Multi-Role: ENABLED                    ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('Commands:');
    console.log('  /generate <type> [hari] [user] [pass]');
    console.log('  /bulk <n> <type> [hari]');
    console.log('  /cheername>');
    console.log('  /testlogin <user> <pass>');
    console.log('  /syncusers');
    console.log('  /fixuser <username>');
    console.log('  /diag');
    console.log('');
})
