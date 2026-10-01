/* ==========================================================
   ZEYRON COMMAND — BOT TELEGRAM v6.0 FINAL
   File: bot.js
   
   FITUR:
   • Auto-generate akun (member, permanent, admin, owner, style)
   • Pool system (FIFO) + auto-generate on demand
   • Payment QRIS (Pakasir / Demo)
   • Auto-delivery akun ke Telegram user
   • Multi-role support (Developer tetap Developer)
   • Base64 service account (Railway/Render friendly)
   • Webhook endpoints lengkap
   • Error handling + logging bersih
   • Support VPS / Railway / Render / Fly.io
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
    // Telegram
    BOT_TOKEN: process.env.BOT_TOKEN || '8929798096:AAFrynjFbR9ejXt_N2kvnGSe4xv5sNbCXb8',
    OWNER_ID: parseInt(process.env.OWNER_ID || '8790176339'),
    ADMIN_CHAT: parseInt(process.env.ADMIN_CHAT || '-1004425930502'),

    // Server
    PORT: process.env.PORT || 3000,
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',

    // Payment Gateway
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'demo', // demo | pakasir | tripay
    PAYMENT_API_KEY: process.env.PAYMENT_API_KEY || '',
    PAYMENT_PROJECT: process.env.PAYMENT_PROJECT || 'zeyron-command',
    PAYMENT_MERCHANT: process.env.PAYMENT_MERCHANT || 'ZEYRON COMMAND',

    // Webhook secret
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'zeyron_secret_2026',

    // Firebase
    SERVICE_ACCOUNT_PATH: process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
};

/* ==========================================================
   ACCOUNT TYPES (Jenis akun yang bisa di-generate)
   ========================================================== */
const ACCOUNT_TYPES = {
    member: {
        id: 'member',
        name: 'Member Premium',
        prefix: 'mbr',
        needsDuration: true,
        minDays: 1,
        maxDays: 10,
        defaultDays: 7,
        permanent: false,
        loginRole: 'premium',
        pricePerDay: 3000
    },
    permanent: {
        id: 'permanent',
        name: 'Premium Permanent',
        prefix: 'prm',
        needsDuration: false,
        permanent: true,
        loginRole: 'premium',
        price: 45000
    },
    reseller: {
        id: 'reseller',
        name: 'Reseller',
        prefix: 'rsl',
        needsDuration: false,
        permanent: true,
        loginRole: 'reseller',
        price: 75000
    },
    admin: {
        id: 'admin',
        name: 'Admin',
        prefix: 'adm',
        needsDuration: false,
        permanent: true,
        loginRole: 'admin',
        price: 100000
    },
    owner: {
        id: 'owner',
        name: 'Owner',
        prefix: 'own',
        needsDuration: false,
        permanent: true,
        loginRole: 'owner',
        price: 250000
    },
    style: {
        id: 'style',
        name: 'Style',
        prefix: 'sty',
        needsDuration: false,
        permanent: true,
        loginRole: 'premium',
        price: 25000
    }
};

/* ==========================================================
   FIREBASE INIT (Support Base64 + File)
   ========================================================== */
let db, FieldValue, Timestamp;

try {
    let serviceAccount;

    if (process.env.FIREBASE_KEY_BASE64) {
        // Production (Railway/Render) - Base64 dari env
        const json = Buffer.from(process.env.FIREBASE_KEY_BASE64, 'base64').toString('utf8');
        serviceAccount = JSON.parse(json);
        console.log('🔥 Firebase: BASE64 from env');
    } else {
        // Local dev - file JSON
        serviceAccount = require(CONFIG.SERVICE_ACCOUNT_PATH);
        console.log('🔥 Firebase: Local file');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();
    FieldValue = admin.firestore.FieldValue;
    Timestamp = admin.firestore.Timestamp;

    console.log('✅ Firebase Admin connected');
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
   HELPER FUNCTIONS
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

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

/* ==========================================================
   ACCOUNT GENERATOR
   ========================================================== */
async function generateAccount(typeId, days, generatedBy = 'system') {
    const type = ACCOUNT_TYPES[typeId];
    if (!type) throw new Error(`Tipe "${typeId}" tidak valid`);

    // Validasi durasi
    if (type.needsDuration) {
        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            throw new Error(`Durasi harus ${type.minDays}-${type.maxDays} hari`);
        }
    }

    const username = generateUsername(typeId);
    const password = generatePassword(10);
    const expiresAt = calculateExpiry(typeId, days);

    /* ===== 1. SIMPAN KE POOL ===== */
    const poolData = {
        username,
        password,
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
        usedBy: null,
        usedAt: null,
        invoice: null
    };

    const poolRef = await db.collection('account_pool').add(poolData);

    /* ===== 2. SIMPAN KE USERS (untuk login home.html) ===== */
    let expires;
    if (type.permanent || !expiresAt) {
        expires = 'never';
    } else {
        expires = expiresAt.toDate().toISOString().slice(0, 10);
    }

    const userData = {
        username,
        password,
        role: type.loginRole,
        expires,
        wallet: 0,
        banned: false,
        banReason: '',
        createdAt: new Date().toISOString(),
        type: typeId,
        typeName: type.name,
        days: type.needsDuration ? parseInt(days) : null,
        generatedBy,
        source: 'bot_generator',
        avatar: './assets/avatar-default.png',
        themes: [],
        achievements: [],
        exp: 0,
        additionalRoles: []
    };

    await db.collection('users').doc(username).set(userData);

    console.log(`✅ Akun generated: ${username} | ${type.name} | ${expires}`);

    return {
        poolId: poolRef.id,
        username,
        password,
        role: type.loginRole,
        expires,
        type: typeId,
        typeName: type.name,
        days: type.needsDuration ? parseInt(days) : null,
        permanent: type.permanent,
        expiresAt
    };
}

/* ==========================================================
   CLAIM ACCOUNT (saat user beli)
   ========================================================== */
async function claimAccount(roleId, telegram, invoice) {
    // Map roleId ke typeId
    let typeId = roleId;
    if (roleId === 'premium_custom') typeId = 'member';
    if (roleId === 'premium_perm') typeId = 'permanent';

    // Cari akun available di pool
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

        console.log(`📦 Claimed from pool: ${data.username} → ${telegram}`);

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

        stock[typeId] = {
            name: type.name,
            available: snap.size
        };
    }
    return stock;
}

/* ==========================================================
   BOT COMMANDS — USER
   ========================================================== */

// /start
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

// /help
bot.onText(/\/help/, (msg) => {
    const isOwner = msg.from.id === CONFIG.OWNER_ID;

    let text = `📖 *BANTUAN ZEYRON COMMAND*\n\n`;
    text += `*User Commands:*\n`;
    text += `• /start — Menu utama\n`;
    text += `• /riwayat — Riwayat pembelian\n`;
    text += `• /expired — Cek masa aktif\n`;
    text += `• /leaderboard — Top pembeli\n`;
    text += `• /download — Download APK\n`;
    text += `• /support — Chat admin\n`;

    if (isOwner) {
        text += `\n*👑 Admin Commands:*\n`;
        text += `• /roles — List tipe akun\n`;
        text += `• /generate \\<type\\> \\[hari\\]\n`;
        text += `• /bulk \\<n\\> \\<type\\> \\[hari\\]\n`;
        text += `• /stock — Cek stok semua\n`;
        text += `• /accounts \\[type\\] — List akun\n`;
        text += `• /deleteaccount \\<username\\>\n`;
        text += `• /clearused — Clear akun terpakai\n`;
        text += `• /migratepool — Migrate pool ke users\n`;
        text += `• /stats — Statistik\n`;
        text += `• /broadcast \\<pesan\\>\n`;
    }

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// /roles
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

    text += `_Contoh: /generate member 7_`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// /riwayat
bot.onText(/\/riwayat/, async (msg) => {
    const chatId = msg.chat.id;
    const tg = '@' + (msg.from.username || msg.from.id);

    try {
        bot.sendChatAction(chatId, 'typing');

        const snap = await db.collection('transactions')
            .where('telegram', '==', tg)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();

        if (snap.empty) {
            return bot.sendMessage(chatId, '📭 Belum ada transaksi');
        }

        let t = `📚 *Riwayat Pembelian*\n━━━━━━━━━━━━━━━━━━\n\n`;

        snap.forEach((d, i) => {
            const x = d.data();
            const st = x.status === 'paid' ? '✅ LUNAS' : '⏳ PENDING';
            const date = x.createdAt
                ? new Date(x.createdAt.toDate()).toLocaleDateString('id-ID')
                : '-';

            t += `*${i + 1}. ${x.invoice}*\n`;
            t += `   ${x.roleName}\n`;
            t += `   ${st} • ${rupiah(x.total)}\n`;
            t += `   📅 ${date}\n\n`;
        });

        bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Riwayat error:', e);
        bot.sendMessage(chatId, '❌ Error: ' + e.message);
    }
});

// /expired
bot.onText(/\/expired/, async (msg) => {
    const chatId = msg.chat.id;
    const tg = '@' + (msg.from.username || msg.from.id);

    try {
        bot.sendChatAction(chatId, 'typing');

        const snap = await db.collection('accounts')
            .where('telegram', '==', tg)
            .get();

        if (snap.empty) {
            return bot.sendMessage(chatId, '📭 Belum ada akun');
        }

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

            t += `*${i + 1}. \`${x.username}\`*\n`;
            t += `   Role: ${x.role}\n`;
            t += `   ${exp}\n\n`;
        });

        bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Expired error:', e);
        bot.sendMessage(chatId, '❌ Error: ' + e.message);
    }
});

// /leaderboard
bot.onText(/\/leaderboard/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        bot.sendChatAction(chatId, 'typing');

        const snap = await db.collection('transactions')
            .where('status', '==', 'paid')
            .get();

        if (snap.empty) {
            return bot.sendMessage(chatId, '📭 Belum ada transaksi');
        }

        const map = {};
        snap.forEach(d => {
            const x = d.data();
            const k = x.telegram || x.username;
            map[k] = (map[k] || 0) + Number(x.total || 0);
        });

        const arr = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let t = `🏆 *Top Spender*\n━━━━━━━━━━━━━━━━━━\n\n`;

        arr.forEach(([u, v], i) => {
            const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            t += `${m} ${u}\n    💰 ${rupiah(v)}\n\n`;
        });

        bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Leaderboard error:', e);
        bot.sendMessage(chatId, '❌ Error: ' + e.message);
    }
});

// /support
bot.onText(/\/support/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `📞 *Hubungi Support*\n\n` +
        `👑 Owner: Jaden Hiram\n` +
        `📧 Email: vexoraofficial@gmail.com\n` +
        `📱 Telegram: +62 859-2364-8453\n` +
        `💬 WhatsApp: +62 882-0092-39791\n\n` +
        `⏰ Respon: 1-24 jam\n` +
        `🌐 Partner: Vexora, Jamzz Str, Zeyron Official`,
        { parse_mode: 'Markdown' }
    );
});

// /download
bot.onText(/\/download/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `📱 *Download APK Zeyron Command*\n\n` +
        `🔗 MediaFire: https://www.mediafire.com/file/zeyron-command-app\n\n` +
        `⚠️ Install dari sumber terpercaya!`,
        { parse_mode: 'Markdown' }
    );
});

/* ==========================================================
   BOT COMMANDS — ADMIN
   ========================================================== */

// /generate <type> [days]
bot.onText(/\/generate\s+(\S+)(?:\s+(\d+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) {
        return bot.sendMessage(msg.chat.id, '❌ Hanya Developer');
    }

    const typeId = match[1].toLowerCase();
    const days = match[2] || null;
    const type = ACCOUNT_TYPES[typeId];

    if (!type) {
        return bot.sendMessage(msg.chat.id,
            `❌ Tipe \`${typeId}\` tidak valid\n\nGunakan /roles untuk lihat daftar`,
            { parse_mode: 'Markdown' }
        );
    }

    if (type.needsDuration) {
        const d = parseInt(days);
        if (isNaN(d) || d < type.minDays || d > type.maxDays) {
            return bot.sendMessage(msg.chat.id,
                `⚠️ Untuk *${type.name}*, wajib isi durasi ${type.minDays}-${type.maxDays} hari\n\n` +
                `Contoh: \`/generate ${typeId} 7\``,
                { parse_mode: 'Markdown' }
            );
        }
    }

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        const acc = await generateAccount(typeId, days, 'owner_manual');

        const expText = acc.expiresAt
            ? acc.expiresAt.toDate().toLocaleString('id-ID')
            : '♾️ Permanent';

        const durText = acc.days ? `${acc.days} hari` : (acc.permanent ? 'Permanent' : '-');

        bot.sendMessage(msg.chat.id,
            `✅ *AKUN DI-GENERATE*\n\n` +
            `📦 Tipe: *${acc.typeName}*\n` +
            `🎭 Role Login: \`${acc.role}\`\n` +
            `⏳ Durasi: ${durText}\n` +
            `📅 Expired: ${expText}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 Username: \`${acc.username}\`\n` +
            `🔑 Password: \`${acc.password}\`\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `💾 Pool: available ✅\n` +
            `🔐 Login home.html: SIAP ✅`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('Generate error:', e);
        bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
});

// /bulk <count> <type> [days]
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
            const csv = accounts.map(a =>
                `${a.username}|${a.password}|${a.type}|${days || 'permanent'}`
            ).join('\n');
            const buffer = Buffer.from(csv, 'utf8');
            await bot.sendDocument(msg.chat.id, buffer, {
                caption: `✅ ${count} akun ${type.name} (${days ? days + ' hari' : 'permanent'})`
            }, {
                filename: `accounts_${typeId}_${Date.now()}.txt`,
                contentType: 'text/plain'
            });
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

// /stock
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

// /accounts [type]
bot.onText(/\/accounts(?:\s+(\S+))?/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;

    const typeId = match[1]?.toLowerCase();

    try {
        bot.sendChatAction(msg.chat.id, 'typing');
        let q = db.collection('account_pool');
        if (typeId && ACCOUNT_TYPES[typeId]) {
            q = q.where('type', '==', typeId);
        }

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

// /deleteaccount <username>
bot.onText(/\/deleteaccount\s+(\S+)/, async (msg, match) => {
    if (msg.from.id !== CONFIG.OWNER_ID) return;
    const username = match[1];

    try {
        let deletedPool = false;
        let deletedUser = false;

        // Hapus dari pool
        const poolSnap = await db.collection('account_pool')
            .where('username', '==', username).limit(1).get();
        if (!poolSnap.empty) {
            await poolSnap.docs[0].ref.delete();
            deletedPool = true;
        }

        // Hapus dari users
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
            `✅ \`${username}\` dihapus\n\n` +
            `Pool: ${deletedPool ? '✅' : '❌'}\n` +
            `Users: ${deletedUser ? '✅' : '❌'}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

// /clearused
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

// /migratepool — Migrate akun pool lama ke users
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

            let role = 'member';
            if (data.type === 'owner') role = 'owner';
            else if (data.type === 'admin') role = 'admin';
            else if (data.type === 'reseller') role = 'reseller';
            else if (data.type === 'permanent' || data.type === 'style') role = 'premium';

            let expires = 'never';
            if (!data.permanent && data.expiresAt) {
                const dt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
                expires = dt.toISOString().slice(0, 10);
            }

            try {
                await userRef.set({
                    username,
                    password: data.password,
                    role,
                    expires,
                    wallet: 0,
                    banned: false,
                    banReason: '',
                    createdAt: new Date().toISOString(),
                    type: data.type,
                    typeName: data.typeName,
                    days: data.days || null,
                    generatedBy: data.generatedBy || 'migration',
                    source: 'migrated_from_pool',
                    avatar: './assets/avatar-default.png',
                    themes: [],
                    achievements: [],
                    exp: 0,
                    additionalRoles: []
                });
                migrated++;
            } catch (e) {
                console.error(`Failed migrate ${username}:`, e);
                failed++;
            }
        }

        await bot.editMessageText(
            `✅ *MIGRASI SELESAI*\n\n` +
            `📦 Total di pool: ${snap.size}\n` +
            `✅ Migrated: *${migrated}*\n` +
            `⏭️ Skipped (sudah ada): *${skipped}*\n` +
            `❌ Failed: *${failed}*\n\n` +
            `Semua akun yang di-migrate sekarang *BISA LOGIN* di home.html ✅`,
            { chat_id: msg.chat.id, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('Migration error:', e);
        bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
    }
});

// /stats
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
            `📊 *STATISTIK BOT*\n━━━━━━━━━━━━━━━━━━\n\n` +
            `💰 Revenue: *${rupiah(rev)}*\n` +
            `✅ Lunas: *${paid}*\n` +
            `⏳ Pending: *${pending}*\n` +
            `📦 Akun terjual: *${aSnap.size}*\n` +
            `🎁 Akun di pool: *${pSnap.size}*\n` +
            `👥 Total Users: *${uSnap.size}*\n` +
            `📈 Total Transaksi: *${tSnap.size}*\n\n` +
            `🕐 ${new Date().toLocaleString('id-ID')}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        bot.sendMessage(msg.chat.id, '❌ ' + e.message);
    }
});

// /broadcast <pesan>
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

// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'Zeyron Command Bot',
        version: '6.0.0',
        features: ['order', 'payment', 'account-generator', 'pool-system', 'multi-role'],
        endpoints: [
            'POST /order',
            'POST /payment/create',
            'POST /payment/webhook',
            'POST /dev/login',
            'POST /dev/change-password',
            'POST /dev/discount',
            'POST /dev/settings',
            'POST /api/generate'
        ],
        time: new Date().toISOString()
    });
});

/* ==================== ORDER (Auto-deliver) ==================== */
app.post('/order', async (req, res) => {
    try {
        const {
            invoice,
            role,
            roleId,
            duration,
            total,
            telegram,
            days
        } = req.body;

        if (!invoice || !telegram || !roleId) {
            return res.status(400).json({ ok: false, error: 'Missing fields' });
        }

        // Cek duplikat
        const existing = await db.collection('accounts')
            .where('invoice', '==', invoice).limit(1).get();

        if (!existing.empty) {
            return res.json({ ok: true, message: 'Already delivered' });
        }

        // Claim akun dari pool
        const acc = await claimAccount(roleId, telegram, invoice);

        // Simpan ke collection accounts
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

        // Kirim ke Telegram user
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
                telegram: tgId,
                message: userMsg,
                invoice,
                reason: e.message,
                createdAt: FieldValue.serverTimestamp()
            });
        }

        // Notif admin
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

        res.json({
            ok: true,
            invoice,
            username: acc.username,
            fromPool: acc.fromPool,
            delivered
        });
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

        let qrisUrl = '';
        let provider = 'demo';

        // Pakasir real
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

        // Fallback demo
        if (!qrisUrl) {
            const payload = `00020101021226610014ID.CO.QRIS.WWW0118${invoice}0215ID1020021949203031ID5204581253033605802ID5910ZEYRON CO6007JAKARTA61051219062070703A015402${amount}6304ABCD`;
            qrisUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&bgcolor=ffffff&color=000000&data=' +
                encodeURIComponent(payload);
        }

        // Simpan ke Firestore
        await db.collection('topups').doc(invoice).set({
            invoice,
            username: customer,
            amount: Number(amount),
            type: type || 'topup',
            roleId: roleId || null,
            days: days || null,
            status: 'pending',
            qrisUrl,
            provider,
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
        const { invoice } = req.params;

        const topupSnap = await db.collection('topups').doc(invoice).get();
        if (!topupSnap.exists) {
            return res.json({ ok: true, status: 'not_found' });
        }

        const data = topupSnap.data();
        res.json({ ok: true, status: data.status, data });
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

        if (!invoice) {
            return res.status(400).json({ ok: false, error: 'No invoice' });
        }

        const successStatus = ['paid', 'completed', 'settlement', 'success', 'berhasil', 'lunas'];
        if (!successStatus.includes(status)) {
            return res.json({ ok: true, received: true });
        }

        const topupRef = db.collection('topups').doc(invoice);
        const topupSnap = await topupRef.get();

        if (!topupSnap.exists) {
            return res.status(404).json({ ok: false, error: 'Invoice not found' });
        }

        const topup = topupSnap.data();
        if (topup.status === 'paid') {
            return res.json({ ok: true, message: 'Already processed' });
        }

        // Update status
        await topupRef.update({
            status: 'paid',
            paidAt: FieldValue.serverTimestamp(),
            webhookData: body
        });

        // Credit saldo user
        if (topup.type === 'topup' && topup.username) {
            const userRef = db.collection('users').doc(topup.username);
            const userSnap = await userRef.get();

            if (userSnap.exists) {
                const user = userSnap.data();
                const newSaldo = (user.wallet || 0) + Number(topup.amount);

                await userRef.update({
                    wallet: newSaldo,
                    lastTopup: new Date().toISOString()
                });

                console.log(`✅ Topup: ${topup.username} +${rupiah(topup.amount)}`);

                // Notif ke user
                if (user.telegram) {
                    const tgId = String(user.telegram).replace(/[^0-9]/g, '') ||
                                 String(user.telegram).replace('@', '');
                    bot.sendMessage(tgId,
                        `💰 *TOP-UP BERHASIL*\n\n` +
                        `💵 Nominal: *${rupiah(topup.amount)}*\n` +
                        `🧾 Invoice: \`${invoice}\`\n` +
                        `💳 Saldo Baru: *${rupiah(newSaldo)}*\n\n` +
                        `_Terima kasih!_`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => {});
                }

                // Notif admin
                if (CONFIG.ADMIN_CHAT) {
                    bot.sendMessage(CONFIG.ADMIN_CHAT,
                        `💰 *TOP-UP MASUK*\n\n` +
                        `👤 User: \`${topup.username}\`\n` +
                        `💵 Nominal: *${rupiah(topup.amount)}*\n` +
                        `🧾 Invoice: \`${invoice}\``,
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
        const { secret, roleId, typeId, count, duration } = req.body;

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
            const acc = await generateAccount(tid, duration, 'api');
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
        if (!email || !password) {
            return res.status(400).json({ ok: false });
        }

        const snap = await db.collection('developers')
            .where('email', '==', email)
            .where('password', '==', password)
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(401).json({ ok: false, error: 'Kredensial salah' });
        }

        const dev = snap.docs[0].data();
        if (dev.active === false) {
            return res.status(401).json({ ok: false, error: 'Akun nonaktif' });
        }

        res.json({
            ok: true,
            dev: { email: dev.email, name: dev.name || 'Developer' }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

/* ==================== DEV CHANGE PASSWORD ==================== */
app.post('/dev/change-password', async (req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.body;
        if (!email || !oldPassword || !newPassword) {
            return res.status(400).json({ ok: false });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ ok: false, error: 'Min 8 karakter' });
        }

        const snap = await db.collection('developers')
            .where('email', '==', email)
            .where('password', '==', oldPassword)
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(401).json({ ok: false, error: 'Password salah' });
        }

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
            .limit(1)
            .get();

        if (devSnap.empty) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }

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
            .limit(1)
            .get();

        if (devSnap.empty) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }

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

        if (!username || !roleId) {
            return res.status(400).json({ ok: false, error: 'Missing fields' });
        }

        const type = ACCOUNT_TYPES[roleId];
        if (!type) {
            return res.status(400).json({ ok: false, error: 'Role tidak valid' });
        }

        // Hitung total
        let total = 0;
        let duration = 'never';

        if (roleId === 'member') {
            const d = parseInt(days);
            if (isNaN(d) || d < 1 || d > 10) {
                return res.status(400).json({ ok: false, error: 'Durasi 1-10 hari' });
            }
            total = type.pricePerDay * d;
            const expiry = new Date(Date.now() + d * 86400000);
            duration = expiry.toISOString().slice(0, 10);
        } else {
            total = type.price;
        }

        // Cek user
        const userRef = db.collection('users').doc(username);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });
        }

        const user = userSnap.data();
        const saldo = user.wallet || 0;

        if (saldo < total) {
            return res.status(400).json({
                ok: false,
                error: 'Saldo tidak cukup',
                needed: total - saldo,
                saldo
            });
        }

        // Cek developer
        const isDev = user.role === 'developer';

        if (isDev) {
            // Developer — tetap developer, tambah additionalRoles
            const additional = user.additionalRoles || [];
            if (!additional.includes(roleId)) {
                additional.push(roleId);
            }

            await userRef.update({
                wallet: saldo - total,
                role: 'developer',
                additionalRoles: additional
            });
        } else {
            // User biasa
            await userRef.update({
                wallet: saldo - total,
                role: type.loginRole,
                expires: duration
            });
        }

        // Log transaksi
        await db.collection('transactions').add({
            invoice: 'BUY-' + Date.now().toString(36).toUpperCase(),
            username,
            roleId,
            roleName: type.name,
            days: days || null,
            total,
            status: 'paid',
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

/* ==================== REDEEM CODE ==================== */
app.post('/redeem/buy', async (req, res) => {
    try {
        const { resellerUsername, roleId, days } = req.body;

        const resellerRef = db.collection('users').doc(resellerUsername);
        const resellerSnap = await resellerRef.get();

        if (!resellerSnap.exists) {
            return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });
        }

        const reseller = resellerSnap.data();
        const allRoles = [reseller.role, ...(reseller.additionalRoles || [])];
        const isResellerOrUp = allRoles.some(r => ['reseller', 'admin', 'owner', 'developer'].includes(r));

        if (!isResellerOrUp) {
            return res.status(403).json({ ok: false, error: 'Hanya Reseller/Admin/Owner' });
        }

        const type = ACCOUNT_TYPES[roleId];
        if (!type) {
            return res.status(400).json({ ok: false, error: 'Role tidak valid' });
        }

        let basePrice = 0;
        if (roleId === 'member') {
            const d = parseInt(days) || 1;
            basePrice = type.pricePerDay * d;
        } else {
            basePrice = type.price;
        }
        const price = Math.round(basePrice * 0.5); // Diskon 50%

        const saldo = reseller.wallet || 0;
        if (saldo < price) {
            return res.status(400).json({ ok: false, error: 'Saldo tidak cukup', needed: price });
        }

        const code = 'ZYR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

        await db.collection('redeem_codes').doc(code).set({
            code,
            roleId,
            roleName: type.name,
            days: days || null,
            createdBy: resellerUsername,
            status: 'available',
            createdAt: FieldValue.serverTimestamp(),
            redeemedBy: null,
            redeemedAt: null
        });

        await resellerRef.update({ wallet: saldo - price });

        res.json({
            ok: true,
            code,
            price,
            roleName: type.name,
            days: days || null,
            newSaldo: saldo - price
        });
    } catch (e) {
        console.error('Redeem buy error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/redeem/use', async (req, res) => {
    try {
        const { username, code } = req.body;

        if (!username || !code) {
            return res.status(400).json({ ok: false, error: 'Missing fields' });
        }

        const codeRef = db.collection('redeem_codes').doc(code);
        const codeSnap = await codeRef.get();

        if (!codeSnap.exists) {
            return res.status(404).json({ ok: false, error: 'Kode tidak valid' });
        }

        const codeData = codeSnap.data();

        if (codeData.status !== 'available') {
            return res.status(400).json({ ok: false, error: 'Kode sudah terpakai' });
        }

        if (codeData.createdBy === username) {
            return res.status(400).json({ ok: false, error: 'Tidak bisa redeem kode sendiri' });
        }

        let expires = 'never';
        if (codeData.days) {
            const d = parseInt(codeData.days);
            expires = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
        }

        const userRef = db.collection('users').doc(username);
        await userRef.update({
            role: codeData.roleId === 'member' ? 'premium' : codeData.roleId,
            expires,
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
        if (!theme) {
            return res.status(400).json({ ok: false, error: 'Tema tidak valid' });
        }

        const userRef = db.collection('users').doc(username);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ ok: false, error: 'User tidak ditemukan' });
        }

        const user = userSnap.data();
        const saldo = user.wallet || 0;

        if (saldo < theme.price) {
            return res.status(400).json({ ok: false, error: 'Saldo tidak cukup', needed: theme.price });
        }

        const owned = user.themes || [];
        if (owned.includes(themeId)) {
            return res.status(400).json({ ok: false, error: 'Tema sudah dimiliki' });
        }

        await userRef.update({
            wallet: saldo - theme.price,
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

/* ==================== ERROR HANDLERS ==================== */
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

/* ==================== START SERVER ==================== */
const server = app.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   ⚔️  ZEYRON COMMAND BOT v6.0.0              ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║   🌐  Port      : ${String(CONFIG.PORT).padEnd(27)}║`);
    console.log(`║   💳  Provider  : ${CONFIG.PAYMENT_PROVIDER.padEnd(27)}║`);
    console.log(`║   🤖  Bot       : Active                     ║`);
    console.log(`║   🔥  Firebase  : Connected                  ║`);
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║   🎁  Account Generator: ENABLED             ║');
    console.log('║   📦  Pool System: ENABLED                   ║');
    console.log('║   🔐  Dual-Write (pool + users): ENABLED     ║');
    console.log('║   👑  Multi-Role Support: ENABLED            ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('Commands:');
    console.log('  /generate <type> [hari]    → Generate 1 akun');
    console.log('  /bulk <n> <type> [hari]    → Generate banyak');
    console.log('  /stock                     → Cek stok');
    console.log('  /migratepool               → Migrate pool lama');
    console.log('');
});