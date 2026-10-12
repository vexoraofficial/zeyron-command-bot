/* ============================================================
   ████████████████████████████████████████████████████████████
   ██                                                        ██
   ██   ███    ██ ██    ██ ██   ██    ██    ██  ██████      ██
   ██   ████   ██  ██  ██   ██ ██    ██    ██ ██    ██     ██
   ██   ██ ██  ██   ████     ███      ██  ██  ██    ██     ██
   ██   ██  ██ ██    ██       ██       ████    ██    ██     ██
   ██   ██   ████    ██       ██        ██      ██████      ██
   ██                                                        ██
   ████████████████████████████████████████████████████████████

   ███ NYX VOID — TELEGRAM BOT v4.3 (FINAL ABSOLUTE)
   ============================================================
   Account Generator + Manager + Orders + CS + Firebase Sync
   ============================================================

   Deploy  : Railway / VPS / Heroku / Render / Local
   Author  : Nyx Void
   Sync    : 100% realtime dengan website.html & index.html

   ------------------------------------------------------------
   FITUR UTAMA:
   ------------------------------------------------------------
     ✅ Account Generator (7 role)
     ✅ Account Manager (edit, ban, delete, dll)
     ✅ Order Management (approve, reject)
     ✅ Customer Service Chat (realtime)
     ✅ Broadcast Announcement
     ✅ Sessions Tracking
     ✅ Statistics Dashboard
     ✅ Credentials Viewer (case-insensitive)
     ✅ Data Export (JSON backup)
     ✅ Anti-duplicate Notification
     ✅ Realtime Firebase Listener
     ✅ Graceful Shutdown
     ✅ Auto Retry Firebase Connection
     ✅ Role-based Access Control

   ------------------------------------------------------------
   MAINTENANCE COMMANDS (SEPARATED):
   ------------------------------------------------------------
     /maintenance on [pesan]
       → Maintenance GLOBAL (index.html)
       → Path: nyx/maintenance

     /maintweb on [pesan]
       → Maintenance WEB (website.html)
       → Path: nyx/maintenanceWeb
       → Priority: web > global (fallback)

   ------------------------------------------------------------
   INSTALL:
   ------------------------------------------------------------
     npm init -y
     npm install node-telegram-bot-api firebase dotenv

   ------------------------------------------------------------
   ENV (opsional, bisa hardcode di CONFIG):
   ------------------------------------------------------------
     BOT_TOKEN=xxx
     FIREBASE_DATABASE_URL=xxx

   ------------------------------------------------------------
   RUN:
   ------------------------------------------------------------
     node bot.js

   ============================================================ */

'use strict';

// ============================================================
// IMPORTS
// ============================================================
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  onChildAdded,
  onValue,
  off
} = require('firebase/database');

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {

  // --- Bot Credentials ---
  BOT_TOKEN: process.env.BOT_TOKEN || '8864714423:AAHbxDX9esc8ZWzqdeO_C1HUdydSMSvESx0',
  BOT_NAME: 'Nyx Void Bot',
  BOT_VERSION: '4.3.0',

  // --- Developer Access ---
  DEV_IDS: [8790176339],
  DEV_USERNAME: 'nyxvoid',

  // --- Logging ---
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // --- Rate Limiting ---
  RATE_LIMIT_MS: 1200,

  // --- Pagination ---
  MAX_USERS_PER_PAGE: 8,
  MAX_ORDERS_PER_PAGE: 8,
  CREDS_PER_PAGE: 10,

  // --- Anti-Duplicate Buffer ---
  MAX_SEEN: 500,

  // --- Session Retention ---
  SESSION_RETENTION_DAYS: 7,
  ONLINE_THRESHOLD_MS: 5 * 60 * 1000,

  // --- Time Constants ---
  DAY_MS: 24 * 60 * 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  MINUTE_MS: 60 * 1000,

  // --- Bot Start Timestamp ---
  BOT_START_TIME: Date.now()
};

// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCWmUSr3s-quKETZVGmB_Xn1gmPhqgjnkQ",
  authDomain: "nyx-void-apk.firebaseapp.com",
  databaseURL: "https://nyx-void-apk-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nyx-void-apk",
  storageBucket: "nyx-void-apk.firebasestorage.app",
  messagingSenderId: "1073455294823",
  appId: "1:1073455294823:web:244a4d43d35d3a0f4b27c2",
  measurementId: "G-HZJ9X4LLM2"
};

// ============================================================
// ROLE SYSTEM
// ============================================================
const ROLE_MEMBER       = 'MEMBER';
const ROLE_MEMBER_MONTH = 'MEMBER 1 BULAN';
const ROLE_PREMIUM      = 'PREMIUM PERMANENT';
const ROLE_RESELLER     = 'RESELLER';
const ROLE_ADMIN        = 'ADMIN';
const ROLE_OWNER        = 'OWNER';
const ROLE_IMMORTAL     = 'IMMORTAL';

const ROLES = [
  ROLE_MEMBER,
  ROLE_MEMBER_MONTH,
  ROLE_PREMIUM,
  ROLE_RESELLER,
  ROLE_ADMIN,
  ROLE_OWNER,
  ROLE_IMMORTAL
];

const ROLE_NAME_MAP = {
  'MEMBER PER DAY':    ROLE_MEMBER,
  'MEMBER 1 BULAN':    ROLE_MEMBER_MONTH,
  'PREMIUM PERMANENT': ROLE_PREMIUM,
  'RESELLER':          ROLE_RESELLER,
  'ADMIN':             ROLE_ADMIN,
  'OWNER':             ROLE_OWNER,
  'IMMORTAL':          ROLE_IMMORTAL,
  'MEMBER':            ROLE_MEMBER,
  'MEMBER MONTH':      ROLE_MEMBER_MONTH,
  'PREMIUM':           ROLE_PREMIUM
};

const ROLE_ALIASES = {
  member: ROLE_MEMBER,
  daily: ROLE_MEMBER,
  day: ROLE_MEMBER,
  harian: ROLE_MEMBER,

  monthly: ROLE_MEMBER_MONTH,
  month: ROLE_MEMBER_MONTH,
  bulan: ROLE_MEMBER_MONTH,
  '1bulan': ROLE_MEMBER_MONTH,
  '1bln': ROLE_MEMBER_MONTH,

  premium: ROLE_PREMIUM,
  prem: ROLE_PREMIUM,
  perm: ROLE_PREMIUM,

  reseller: ROLE_RESELLER,
  res: ROLE_RESELLER,

  admin: ROLE_ADMIN,
  adm: ROLE_ADMIN,

  owner: ROLE_OWNER,
  own: ROLE_OWNER,

  immortal: ROLE_IMMORTAL,
  imm: ROLE_IMMORTAL,
  imortal: ROLE_IMMORTAL
};

const ROLE_FIXED_DAYS = {
  [ROLE_MEMBER_MONTH]: 30
};

const ROLE_EMOJI_MAP = {
  [ROLE_MEMBER]: '👤',
  [ROLE_MEMBER_MONTH]: '📅',
  [ROLE_PREMIUM]: '💎',
  [ROLE_RESELLER]: '🏪',
  [ROLE_ADMIN]: '🛡️',
  [ROLE_OWNER]: '👑',
  [ROLE_IMMORTAL]: '💀',
  'DEVELOPER': '👑'
};

// ============================================================
// ROLE RESOLVER
// ============================================================
function resolveRole(input){
  if (!input) return null;
  const key = String(input).toLowerCase().replace(/\s+/g, '');
  if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
  const upper = String(input).toUpperCase();
  if (ROLES.includes(upper)) return upper;
  return null;
}

function resolveRoleFromName(roleName){
  if (!roleName) return null;
  const upper = String(roleName).toUpperCase().trim();
  if (ROLE_NAME_MAP[upper]) return ROLE_NAME_MAP[upper];
  if (ROLES.includes(upper)) return upper;
  return null;
}

// ============================================================
// VALIDATION
// ============================================================
function validateEnv(){
  const missing = [];
  if (!CONFIG.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!firebaseConfig.databaseURL) missing.push('FIREBASE_DATABASE_URL');
  if (CONFIG.DEV_IDS.length === 0) missing.push('DEV_IDS');
  if (missing.length){
    console.error('❌ ENV MISSING:', missing.join(', '));
    process.exit(1);
  }
}
validateEnv();

// ============================================================
// LOGGER
// ============================================================
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[CONFIG.LOG_LEVEL] ?? 2;

function ts(){
  return new Date().toISOString();
}

const log = {
  error: (...a) => currentLevel >= 0 && console.error('❌', ts(), ...a),
  warn:  (...a) => currentLevel >= 1 && console.warn ('⚠️', ts(), ...a),
  info:  (...a) => currentLevel >= 2 && console.log  ('ℹ️', ts(), ...a),
  debug: (...a) => currentLevel >= 3 && console.log  ('🐛', ts(), ...a),
  ok:    (...a) => console.log('✅', ts(), ...a)
};

// ============================================================
// FIREBASE INIT
// ============================================================
let db = null;
let fbApp = null;

try {
  fbApp = initializeApp(firebaseConfig);
  db = getDatabase(fbApp);
  log.ok('Firebase initialized');
} catch(e){
  log.error('Firebase init error:', e.message);
  process.exit(1);
}

// ============================================================
// BOT INIT
// ============================================================
const bot = new TelegramBot(CONFIG.BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 30 }
  }
});

log.ok(`Bot started: @${CONFIG.BOT_NAME} v${CONFIG.BOT_VERSION}`);

// ============================================================
// USER STATE (untuk wizard multi-step)
// ============================================================
const userStates = new Map();

function setState(chatId, state){
  userStates.set(chatId, state);
}

function getState(chatId){
  return userStates.get(chatId);
}

function clearState(chatId){
  userStates.delete(chatId);
}

// ============================================================
// RATE LIMITER
// ============================================================
const lastCommand = new Map();

function rateLimited(userId){
  const now = Date.now();
  const last = lastCommand.get(userId) || 0;
  if (now - last < CONFIG.RATE_LIMIT_MS) return true;
  lastCommand.set(userId, now);
  return false;
}

// ============================================================
// UTILITY HELPERS
// ============================================================
function safeKey(str){
  return String(str).replace(/[.#$\[\]\/]/g, '_').toLowerCase();
}

function escapeHtml(s){
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[m]));
}

function formatDate(ts){
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  } catch(e){
    return '-';
  }
}

function formatDateShort(ts){
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
  } catch(e){
    return '-';
  }
}

function fmtRp(n){
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function isDev(userId){
  return CONFIG.DEV_IDS.includes(userId);
}

function isValidUsername(u){
  if (!u) return false;
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(u);
}

function isValidPassword(p){
  if (typeof p !== 'string') return false;
  if (p.length < 4 || p.length > 64) return false;
  if (/[*"'_]/.test(p)) return false;
  return true;
}

function isExpired(user){
  if (!user) return false;
  if (!user.expiry || user.expiry === 0) return false;
  return Date.now() > user.expiry;
}

function expiryLabel(user){
  if (!user) return '-';
  if (!user.expiry || user.expiry === 0) return 'PERMANENT';
  const ms = user.expiry - Date.now();
  if (ms <= 0) return 'EXPIRED';
  const d = Math.floor(ms / CONFIG.DAY_MS);
  const h = Math.floor((ms % CONFIG.DAY_MS) / CONFIG.HOUR_MS);
  if (d > 0) return d + 'd ' + h + 'h';
  return h + 'h';
}

function roleEmoji(role){
  return ROLE_EMOJI_MAP[role] || '🎭';
}

function genMsgId(prefix){
  const p = prefix || 'MSG';
  return p + '-' + Date.now().toString(36).toUpperCase() +
         Math.random().toString(36).slice(2, 6).toUpperCase();
}

function now(){
  return Date.now();
}

// ============================================================
// ANTI-DUPLICATE NOTIFICATION TRACKER
// ============================================================
const seenOrders = new Set();
const seenMsgs   = new Set();
const seenUsers  = new Set();
const seenMaint  = new Set();

function trackSeen(set, id){
  if (!id) return false;
  if (set.has(id)) return false;
  set.add(id);
  if (set.size > CONFIG.MAX_SEEN){
    const first = set.values().next().value;
    set.delete(first);
  }
  return true;
}

// ============================================================
// FIREBASE: USERS
// ============================================================
async function fbGetUser(username){
  if (!username) return null;

  const raw = String(username).trim();
  const sanitized = raw.replace(/[.#$\[\]\/]/g, '_');
  const lowerSanitized = sanitized.toLowerCase();

  const variants = [];
  if (sanitized) variants.push(sanitized);
  if (lowerSanitized && lowerSanitized !== sanitized) variants.push(lowerSanitized);

  for (const k of variants){
    try {
      const snap = await get(ref(db, 'nyx/users/' + k));
      if (snap.exists()) return snap.val();
    } catch(e){}
  }

  try {
    const all = await fbAllUsers();
    const lowerInput = raw.toLowerCase();
    for (const [key, u] of Object.entries(all)){
      const uname = String((u && u.username) || key).toLowerCase();
      if (uname === lowerInput) return u;
    }
  } catch(e){
    log.error('fbGetUser scan:', e.message);
  }

  return null;
}

async function fbAllUsers(){
  try {
    const snap = await get(ref(db, 'nyx/users'));
    return snap.exists() ? snap.val() : {};
  } catch(e){
    log.error('fbAllUsers:', e.message);
    return {};
  }
}

async function fbCreateUser({ username, password, role, expiredDays }){
  if (!username || !password) throw new Error('Username & password wajib diisi');
  if (!ROLES.includes(role)) throw new Error('Role tidak valid: ' + role);

  const existing = await fbGetUser(username);
  if (existing) throw new Error('Username sudah terdaftar');

  const key = safeKey(username);
  const data = {
    username,
    password,
    role,
    expiry: 0,
    balance: 0,
    isDeveloper: false,
    banned: false,
    createdAt: now(),
    createdBy: 'bot:' + CONFIG.BOT_NAME,
    loginCount: 0
  };

  if (role === ROLE_MEMBER){
    if (!expiredDays || expiredDays < 1 || expiredDays > 10){
      throw new Error('Expired untuk MEMBER harus 1-10 hari');
    }
    data.expiry = now() + (expiredDays * CONFIG.DAY_MS);
    data.expiredDays = expiredDays;
  } else if (ROLE_FIXED_DAYS[role]){
    data.expiry = now() + (ROLE_FIXED_DAYS[role] * CONFIG.DAY_MS);
    data.expiredDays = ROLE_FIXED_DAYS[role];
  }

  await set(ref(db, 'nyx/users/' + key), data);
  return { key, ...data };
}

async function fbDeleteUser(username){
  const existing = await fbGetUser(username);
  if (!existing) throw new Error('User tidak ditemukan');
  if (existing.isDeveloper) throw new Error('Tidak bisa hapus developer');
  const key = safeKey(existing.username || username);
  await remove(ref(db, 'nyx/users/' + key));
  return true;
}

async function fbBanUser(username, banned){
  const existing = await fbGetUser(username);
  if (!existing) throw new Error('User tidak ditemukan');
  if (existing.isDeveloper) throw new Error('Tidak bisa ban developer');
  const key = safeKey(existing.username || username);
  await update(ref(db, 'nyx/users/' + key), { banned: !!banned });
  return true;
}

async function fbSetRole(username, role){
  const existing = await fbGetUser(username);
  if (!existing) throw new Error('User tidak ditemukan');
  if (existing.isDeveloper) throw new Error('Tidak bisa ubah role developer');
  if (!ROLES.includes(role)) throw new Error('Role tidak valid: ' + role);
  const key = safeKey(existing.username || username);
  await update(ref(db, 'nyx/users/' + key), { role });
  return true;
}

async function fbSetExpiry(username, days){
  const existing = await fbGetUser(username);
  if (!existing) throw new Error('User tidak ditemukan');
  const key = safeKey(existing.username || username);
  const expiry = days > 0 ? now() + (days * CONFIG.DAY_MS) : 0;
  await update(ref(db, 'nyx/users/' + key), { expiry });
  return expiry;
}

async function fbSetBalance(username, amount){
  const existing = await fbGetUser(username);
  if (!existing) throw new Error('User tidak ditemukan');
  const key = safeKey(existing.username || username);
  await update(ref(db, 'nyx/users/' + key), { balance: amount });
  return true;
}

async function fbSetPassword(username, newPass){
  const existing = await fbGetUser(username);
  if (!existing) throw new Error('User tidak ditemukan');
  if (!isValidPassword(newPass)) throw new Error('Password tidak valid (4-64 char, tanpa * " \' _)');
  const key = safeKey(existing.username || username);
  await update(ref(db, 'nyx/users/' + key), { password: newPass });
  return true;
}

// ============================================================
// FIREBASE: ORDERS
// ============================================================
async function fbAllOrders(){
  try {
    const snap = await get(ref(db, 'nyx/orders'));
    return snap.exists() ? snap.val() : {};
  } catch(e){ return {}; }
}

async function fbGetOrder(orderId){
  try {
    const snap = await get(ref(db, 'nyx/orders/' + orderId));
    return snap.exists() ? snap.val() : null;
  } catch(e){ return null; }
}

async function fbApproveOrder(orderId){
  const o = await fbGetOrder(orderId);
  if (!o) throw new Error('Order tidak ditemukan');
  if (o.status === 'COMPLETED') throw new Error('Order sudah di-approve');

  const expiry = o.roleType === 'permanent' ? 0 : now() + (o.days || 30) * CONFIG.DAY_MS;
  const finalRole = resolveRoleFromName(o.roleName) || ROLE_MEMBER;

  await update(ref(db, 'nyx/orders/' + orderId), {
    status: 'COMPLETED',
    completedAt: now(),
    approvedRole: finalRole,
    approvedBy: 'bot:' + CONFIG.BOT_NAME
  });

  const existing = await fbGetUser(o.accountUser);
  if (!existing){
    await set(ref(db, 'nyx/users/' + safeKey(o.accountUser)), {
      username: o.accountUser,
      password: o.accountPass,
      role: finalRole,
      expiry: expiry,
      expiredAt: expiry,
      expiredDays: o.days || 0,
      balance: 0,
      isDeveloper: false,
      banned: false,
      createdAt: now(),
      fromOrder: orderId,
      approvedBy: 'bot:' + CONFIG.BOT_NAME,
      loginCount: 0
    });
  } else {
    const existingKey = safeKey(existing.username || o.accountUser);
    const updateData = {
      role: finalRole,
      expiry: expiry,
      expiredAt: expiry,
      expiredDays: o.days || 0,
      approvedBy: 'bot:' + CONFIG.BOT_NAME
    };
    if (existing.password !== o.accountPass){
      updateData.password = o.accountPass;
    }
    await update(ref(db, 'nyx/users/' + existingKey), updateData);
  }

  return { order: o, expiry, created: !existing, finalRole };
}

async function fbRejectOrder(orderId){
  const o = await fbGetOrder(orderId);
  if (!o) throw new Error('Order tidak ditemukan');
  await update(ref(db, 'nyx/orders/' + orderId), {
    status: 'REJECTED',
    rejectedAt: now()
  });
  return o;
}

// ============================================================
// FIREBASE: MESSAGES (CS)
// ============================================================
async function fbAllMessages(){
  try {
    const snap = await get(ref(db, 'nyx/messages'));
    return snap.exists() ? snap.val() : {};
  } catch(e){ return {}; }
}

async function fbSendDevReply(targetUser, text, senderUsername){
  const msgId = genMsgId('MSG');
  const uname = senderUsername || CONFIG.DEV_USERNAME;
  const msg = {
    id: msgId,
    user: uname,
    target: targetUser,
    from: 'dev',
    senderIsDev: true,
    senderName: uname,
    text: text,
    time: now(),
    readByDev: true
  };
  await set(ref(db, 'nyx/messages/' + msgId), msg);
  return msg;
}

async function fbMarkRead(targetUser){
  const msgs = await fbAllMessages();
  const updates = {};
  Object.entries(msgs).forEach(([id, m]) => {
    if (String(m.user || '').toLowerCase() === String(targetUser || '').toLowerCase()
        && m.from === 'user'
        && !m.readByDev){
      updates['nyx/messages/' + id + '/readByDev'] = true;
    }
  });
  if (Object.keys(updates).length){
    await update(ref(db), updates);
  }
  return Object.keys(updates).length;
}

// ============================================================
// FIREBASE: ANNOUNCE
// ============================================================
async function fbGetAnnounce(){
  try {
    const snap = await get(ref(db, 'nyx/announce'));
    return snap.exists() ? snap.val() : null;
  } catch(e){ return null; }
}

async function fbSetAnnounce(text, by){
  await set(ref(db, 'nyx/announce'), {
    text,
    time: now(),
    by: by || 'bot'
  });
}

async function fbClearAnnounce(){
  await remove(ref(db, 'nyx/announce'));
}

// ============================================================
// FIREBASE: SETTINGS
// ============================================================
async function fbGetSettings(){
  try {
    const snap = await get(ref(db, 'nyx/settings'));
    return snap.exists() ? snap.val() : {};
  } catch(e){ return {}; }
}

async function fbSetSettings(data){
  await update(ref(db, 'nyx/settings'), data);
  return true;
}

// ============================================================
// FIREBASE: MAINTENANCE (Global / index.html)
// ============================================================
async function fbGetMaintenance(){
  try {
    const snap = await get(ref(db, 'nyx/maintenance'));
    return snap.exists() ? snap.val() : { enabled: false, message: '', link: '' };
  } catch(e){
    return { enabled: false, message: '', link: '' };
  }
}

async function fbSetMaintenance(data){
  await update(ref(db, 'nyx/maintenance'), data);
  return true;
}

// ============================================================
// FIREBASE: MAINTENANCE WEB (khusus website.html)
// ============================================================
async function fbGetMaintenanceWeb(){
  try {
    const snap = await get(ref(db, 'nyx/maintenanceWeb'));
    return snap.exists() ? snap.val() : { enabled: false, message: '', link: '' };
  } catch(e){
    return { enabled: false, message: '', link: '' };
  }
}

async function fbSetMaintenanceWeb(data){
  await update(ref(db, 'nyx/maintenanceWeb'), data);
  return true;
}

// ============================================================
// FIREBASE: SESSIONS
// ============================================================
async function fbAllSessions(){
  try {
    const snap = await get(ref(db, 'nyx/sessions'));
    return snap.exists() ? snap.val() : {};
  } catch(e){ return {}; }
}

async function fbClearOldSessions(days = 7){
  try {
    const sessions = await fbAllSessions();
    const n = now();
    const THRESHOLD = days * CONFIG.DAY_MS;
    const updates = {};
    let count = 0;
    Object.entries(sessions).forEach(([token, v]) => {
      if (v && v.lastSeen && (n - v.lastSeen) > THRESHOLD){
        updates[token] = null;
        count++;
      }
    });
    if (count > 0) await update(ref(db, 'nyx/sessions'), updates);
    return count;
  } catch(e){
    log.error('fbClearOldSessions:', e.message);
    throw e;
  }
}

// ============================================================
// FIREBASE: STATS
// ============================================================
async function fbGetStats(){
  const [users, orders, sessions, maint, maintWeb] = await Promise.all([
    fbAllUsers(),
    fbAllOrders(),
    fbAllSessions(),
    fbGetMaintenance(),
    fbGetMaintenanceWeb()
  ]);

  const userArr = Object.values(users);
  const orderArr = Object.values(orders);
  const byRole = {};
  let banned = 0, expired = 0, active = 0;

  userArr.forEach(u => {
    byRole[u.role] = (byRole[u.role] || 0) + 1;
    if (u.banned) banned++;
    if (u.role === ROLE_MEMBER && u.expiry && now() > u.expiry) expired++;
    if (!u.banned && (u.role !== ROLE_MEMBER || !u.expiry || now() < u.expiry)) active++;
  });

  const completed = orderArr.filter(o => o.status === 'COMPLETED');
  const pending = orderArr.filter(o => o.status === 'PENDING' || o.status === 'PROCESSING');
  const revenue = completed.reduce((s, o) => s + (o.price || 0), 0);

  const onlineSessions = Object.values(sessions).filter(s =>
    s.lastSeen && (now() - s.lastSeen) < CONFIG.ONLINE_THRESHOLD_MS
  ).length;

  return {
    users: userArr,
    orders: orderArr,
    sessions: Object.keys(sessions).length,
    onlineSessions,
    byRole,
    banned,
    expired,
    active,
    completed: completed.length,
    pending: pending.length,
    revenue,
    maintenance: maint,
    maintenanceWeb: maintWeb
  };
}

// ============================================================
// KEYBOARDS
// ============================================================
const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '👤 Generate Akun', callback_data: 'menu_generate' },
        { text: '📋 Daftar User', callback_data: 'menu_users' }
      ],
      [
        { text: '🔐 Semua Credentials', callback_data: 'menu_creds' },
        { text: '📤 Export JSON', callback_data: 'menu_export' }
      ],
      [
        { text: '📦 Orders', callback_data: 'menu_orders' },
        { text: '💬 CS Chat', callback_data: 'menu_cs' }
      ],
      [
        { text: '📊 Statistik', callback_data: 'menu_stats' },
        { text: '🔧 Maintenance', callback_data: 'menu_maintenance' }
      ],
      [
        { text: '⚙️ Settings', callback_data: 'menu_settings' },
        { text: '💻 Sessions', callback_data: 'menu_sessions' }
      ],
      [
  { text: '📢 Broadcast', callback_data: 'menu_broadcast' },
  { text: '❓ Bantuan', callback_data: 'menu_help' }
],
[
  { text: '🛑 STOP ALL', callback_data: 'menu_stopall' }
]
    ]
  }
};

const ROLE_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '💀 Immortal', callback_data: 'gen_role_IMMORTAL' },
        { text: '👑 Owner', callback_data: 'gen_role_OWNER' }
      ],
      [
        { text: '🛡️ Admin', callback_data: 'gen_role_ADMIN' },
        { text: '🏪 Reseller', callback_data: 'gen_role_RESELLER' }
      ],
      [
        { text: '💎 Premium Permanent', callback_data: 'gen_role_PREMIUM PERMANENT' }
      ],
      [
        { text: '📅 Member 1 Bulan', callback_data: 'gen_role_MEMBER 1 BULAN' }
      ],
      [
        { text: '👤 Member (Harian)', callback_data: 'gen_role_MEMBER' }
      ],
      [
        { text: '❌ Batal', callback_data: 'menu_cancel' }
      ]
    ]
  }
};

const BACK_BTN = {
  reply_markup: {
    inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'menu_back' }]]
  }
};

const MAINT_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🔧 Global (index)', callback_data: 'maint_global_view' },
        { text: '🌐 Web (website)', callback_data: 'maint_web_view' }
      ],
      [
        { text: '⬅️ Kembali', callback_data: 'menu_back' }
      ]
    ]
  }
};

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function requireDev(msg, callback){
  const userId = msg.from.id;
  if (!isDev(userId)){
    bot.sendMessage(msg.chat.id,
      `🚫 <b>AKSES DITOLAK</b>\n\n` +
      `ID Telegram kamu: <code>${userId}</code>\n\n` +
      `Command ini hanya untuk developer.`,
      { parse_mode: 'HTML' }
    );
    return false;
  }
  if (rateLimited(userId)){
    log.debug('Rate limited:', userId);
    return false;
  }
  if (typeof callback === 'function') callback();
  return true;
}

// ============================================================
// SEND HELPERS
// ============================================================
async function send(chatId, text, opts = {}){
  try {
    return await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...opts
    });
  } catch(e){
    log.error('sendMessage error:', e.message);
    return null;
  }
}

async function editMsg(chatId, msgId, text, opts = {}){
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...opts
    });
  } catch(e){
    log.debug('editMessage error:', e.message);
    return null;
  }
}

async function deleteMsg(chatId, msgId){
  try {
    await bot.deleteMessage(chatId, msgId);
  } catch(e){}
}

// ---------- END PART 1 ----------
// ============================================================
// REALTIME LISTENERS — Anti-Duplicate
// ============================================================
function initRealtimeListeners(){

  // ----------------------------------------
  // 🔔 Listen: Order Baru
  // ----------------------------------------
  onChildAdded(ref(db, 'nyx/orders'), async (snap) => {
    const o = snap.val();
    if (!o) return;
    if (o.createdAt && o.createdAt < CONFIG.BOT_START_TIME - 5000) return;
    if (o.status !== 'PENDING') return;
    if (!trackSeen(seenOrders, o.id)) return;

    const durasi = o.roleType === 'permanent' ? 'PERMANENT' : (o.days || 0) + ' hari';
    const text =
      `🆕 <b>ORDER BARU</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🆔 <code>${escapeHtml(o.id)}</code>\n` +
      `👤 Buyer: <b>${escapeHtml(o.buyer)}</b>\n` +
      `🎭 Role: <b>${escapeHtml(o.roleName)}</b>\n` +
      `⏱️ Durasi: ${durasi}\n` +
      `💰 Harga: <b>${fmtRp(o.price)}</b>\n` +
      `🔐 Username: <code>${escapeHtml(o.accountUser)}</code>\n` +
      `🔑 Password: <code>${escapeHtml(o.accountPass)}</code>\n\n` +
      `✅ <code>/approve ${escapeHtml(o.id)}</code>\n` +
      `❌ <code>/reject ${escapeHtml(o.id)}</code>`;

    CONFIG.DEV_IDS.forEach(id => send(id, text));
    log.info('Notif order baru:', o.id);
  });

  // ----------------------------------------
  // 🔔 Listen: CS Message Baru
  // ----------------------------------------
  onChildAdded(ref(db, 'nyx/messages'), async (snap) => {
    const m = snap.val();
    if (!m) return;
    if (m.from !== 'user') return;
    if (m.time && m.time < CONFIG.BOT_START_TIME - 5000) return;
    if (!trackSeen(seenMsgs, m.id)) return;

    const text =
      `📩 <b>PESAN CS BARU</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 Dari: <b>${escapeHtml(m.senderName || m.user)}</b>\n` +
      `💬 Pesan: <i>${escapeHtml(m.text)}</i>\n\n` +
      `Balas:\n<code>/reply ${escapeHtml(m.user)} pesan balasan</code>\n` +
      `Lihat:\n<code>/convo ${escapeHtml(m.user)}</code>`;

    CONFIG.DEV_IDS.forEach(id => send(id, text));
    log.info('Notif CS baru dari:', m.user);
  });

  // ----------------------------------------
  // 🔔 Listen: User Baru Register
  // ----------------------------------------
  onChildAdded(ref(db, 'nyx/users'), async (snap) => {
    const u = snap.val();
    if (!u) return;
    if (u.isDeveloper) return;
    if (u.createdAt && u.createdAt < CONFIG.BOT_START_TIME - 5000) return;
    if (!trackSeen(seenUsers, u.username)) return;

    const text =
      `👤 <b>USER BARU REGISTER</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 Username: <code>${escapeHtml(u.username)}</code>\n` +
      `🎭 Role: <b>${escapeHtml(u.role || 'MEMBER')}</b>\n` +
      `📅 Terdaftar: ${formatDate(u.createdAt)}`;

    CONFIG.DEV_IDS.forEach(id => send(id, text));
    log.info('Notif user baru:', u.username);
  });

  log.ok('Realtime listeners aktif');
}

// ============================================================
// COMMAND: /start
// ============================================================
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isDev(userId)){
    return send(chatId,
      `🔒 <b>${escapeHtml(CONFIG.BOT_NAME)}</b>\n\n` +
      `Bot ini <b>private</b>. ID kamu:\n<code>${userId}</code>\n\n` +
      `Hubungi developer untuk akses.`
    );
  }

  const text =
    `⚡ <b>NYX VOID BOT</b> ⚡\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Selamat datang, <b>Developer</b>!\n\n` +
    `Bot ini terhubung dengan <b>Firebase</b>\n` +
    `dan sync realtime dengan website\n` +
    `<b>NYX VOID</b>.\n\n` +
    `Fitur:\n` +
    `• Generate akun user\n` +
    `• 🔐 Lihat semua username + password\n` +
    `• 📤 Export data ke JSON\n` +
    `• Manage orders pembelian\n` +
    `• Balas CS chat\n` +
    `• Broadcast announcement\n` +
    `• Maintenance (index.html & website.html)\n\n` +
    `<b>Command cepat:</b>\n` +
    `<code>/creds</code> — Semua credentials\n` +
    `<code>/export</code> — Backup JSON\n` +
    `<code>/maintweb</code> — 🌐 Web maintenance\n\n` +
    `Gunakan menu di bawah untuk mulai.`;

  await send(chatId, text, MAIN_MENU);
});

// ============================================================
// COMMAND: /help
// ============================================================
bot.onText(/^\/help$/, (msg) => {
  if (!requireDev(msg)) return;

  const text =
    `📖 <b>DAFTAR COMMAND</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `<b>👤 MANAJEMEN AKUN:</b>\n` +
    `/generate &lt;role&gt; [hari] &lt;user&gt; &lt;pass&gt;\n` +
    `/users — Daftar semua user\n` +
    `/creds — 🔐 Semua username + password\n` +
    `/creds &lt;username&gt; — Detail kredensial user\n` +
    `/creds &lt;role&gt; — Filter by role\n` +
    `/export — 📦 Export semua data ke JSON\n` +
    `/user &lt;username&gt; — Detail user\n` +
    `/delete &lt;username&gt; — Hapus user\n` +
    `/ban &lt;username&gt; — Blokir user\n` +
    `/unban &lt;username&gt; — Buka blokir\n` +
    `/setrole &lt;user&gt; &lt;role&gt; — Ganti role\n` +
    `/setexp &lt;user&gt; &lt;hari&gt; — Set expiry\n` +
    `/setbal &lt;user&gt; &lt;nominal&gt; — Set balance\n` +
    `/setpass &lt;user&gt; &lt;pass&gt; — Reset password\n\n` +

    `<b>📦 ORDER / PEMBELIAN:</b>\n` +
    `/orders — List semua order\n` +
    `/pending — Order pending\n` +
    `/order &lt;id&gt; — Detail order\n` +
    `/approve &lt;id&gt; — Setujui order\n` +
    `/reject &lt;id&gt; — Tolak order\n\n` +

    `<b>💬 CUSTOMER SERVICE:</b>\n` +
    `/msgs — Pesan CS unread\n` +
    `/convo &lt;user&gt; — Lihat history chat\n` +
    `/reply &lt;user&gt; &lt;text&gt; — Balas CS\n\n` +

    `<b>🔧 MAINTENANCE:</b>\n` +
    `/maintenance &lt;on|off&gt; [pesan]\n` +
    `  → 🔧 Global (index.html)\n` +
    `/maintweb &lt;on|off&gt; [pesan]\n` +
    `  → 🌐 Web (website.html)\n` +
    `/maintweb set &lt;pesan&gt;\n` +
    `  → ubah pesan web\n` +
    `/maintweb link &lt;url&gt;\n` +
    `  → set link update web\n\n` +

`<b>📢 BROADCAST:</b>\n` +
`/broadcast &lt;pesan&gt;\n` +
`/clearannounce — Hapus announcement\n\n` +

`<b>🛑 PANIC BUTTON:</b>\n` +
`/stopall — Kill switch global\n` +
`  → matikan SEMUA maintenance\n` +
`  → force reset semua client\n` +
`  → auto-cleanup 30 detik\n\n` +

    `<b>🔧 SISTEM:</b>\n` +
    `/stats — Statistik lengkap\n` +
    `/sessions — Session aktif\n` +
    `/clearsessions [hari] — Hapus session lama\n\n` +

    `<b>⚙️ SETTINGS:</b>\n` +
    `/setapp &lt;nama&gt;\n` +
    `/setwa &lt;url&gt;\n` +
    `/settg &lt;url&gt;\n` +
    `/settt &lt;url&gt;\n` +
    `/settings — Lihat settings\n\n` +

    `<b>ℹ️ INFO:</b>\n` +
    `/whoami — Info akun kamu\n` +
    `/menu — Menu utama\n` +
    `/id — Telegram ID\n` +
    `/cancel — Batalkan wizard\n\n` +

    `<b>📝 FORMAT /generate:</b>\n` +
    `<code>/generate immortal user1 pass123</code>\n` +
    `<code>/generate member 3 user2 pass123</code>\n` +
    `<code>/generate premium user3 pass123</code>\n\n` +

    `<b>Role:</b> member, monthly, premium, reseller, admin, owner, immortal`;

  send(msg.chat.id, text);
});

// ============================================================
// COMMAND: /menu
// ============================================================
bot.onText(/^\/menu$/, (msg) => {
  if (!requireDev(msg)) return;
  send(msg.chat.id, `⚡ <b>MENU UTAMA</b>`, MAIN_MENU);
});

// ============================================================
// COMMAND: /id
// ============================================================
bot.onText(/^\/id$/, (msg) => {
  send(msg.chat.id,
    `🆔 <b>Telegram ID kamu:</b>\n<code>${msg.from.id}</code>\n\n` +
    `Username: @${msg.from.username || '-'}\n` +
    `Nama: ${escapeHtml(msg.from.first_name || '-')}`
  );
});

// ============================================================
// COMMAND: /whoami
// ============================================================
bot.onText(/^\/whoami$/, async (msg) => {
  const userId = msg.from.id;
  const dev = isDev(userId);

  let text = `👤 <b>INFO AKUN TELEGRAM</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `ID: <code>${userId}</code>\n`;
  text += `Username: @${msg.from.username || '-'}\n`;
  text += `Nama: ${escapeHtml(msg.from.first_name || '-')}\n`;
  text += `Role: <b>${dev ? '🛡️ Developer' : '👤 Guest'}</b>\n`;

  send(msg.chat.id, text);
});

// ============================================================
// CREDS PAGE BUILDER
// ============================================================
async function buildCredsPage(page = 1, roleFilter = null){
  const users = await fbAllUsers();
  let entries = Object.values(users);

  if (roleFilter){
    entries = entries.filter(u =>
      String(u.role || '').toUpperCase() === roleFilter.toUpperCase()
    );
  }

  entries.sort((a, b) => {
    if (a.isDeveloper && !b.isDeveloper) return -1;
    if (!a.isDeveloper && b.isDeveloper) return 1;
    const ra = String(a.role || '').localeCompare(String(b.role || ''));
    if (ra !== 0) return ra;
    return String(a.username || '').localeCompare(String(b.username || ''));
  });

  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / CONFIG.CREDS_PER_PAGE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * CONFIG.CREDS_PER_PAGE;
  const slice = entries.slice(start, start + CONFIG.CREDS_PER_PAGE);

  let text = `🔐 <b>ALL CREDENTIALS</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Total: <b>${total}</b> akun`;
  if (roleFilter) text += ` · filter: <b>${escapeHtml(roleFilter)}</b>`;
  text += `\nPage: <b>${safePage}/${totalPages}</b>\n\n`;

  if (!slice.length){
    text += `<i>Tidak ada akun.</i>`;
  } else {
    slice.forEach((u, i) => {
      const idx = start + i + 1;
      const exp = u.expiry > 0 ? expiryLabel(u) : 'PERM';
      const stat = u.banned ? '🚫' : (isExpired(u) ? '⌛' : '✅');
      const devMark = u.isDeveloper ? ' 👑' : '';
      text += `${idx}. ${stat} <b>${escapeHtml(u.username)}</b>${devMark}\n`;
      text += `   🔑 <code>${escapeHtml(u.password || '—')}</code>\n`;
      text += `   ${roleEmoji(u.role)} ${escapeHtml(u.role || '—')} · ${exp}\n\n`;
    });
  }

  const buttons = [];
  const navRow = [];
  if (safePage > 1) navRow.push({ text: '◀ Prev', callback_data: `creds_p_${safePage - 1}` });
  if (safePage < totalPages) navRow.push({ text: 'Next ▶', callback_data: `creds_p_${safePage + 1}` });
  if (navRow.length) buttons.push(navRow);

  buttons.push([
    { text: '👤 Member',  callback_data: 'creds_f_MEMBER' },
    { text: '📅 1 Bulan', callback_data: 'creds_f_MEMBER 1 BULAN' }
  ]);
  buttons.push([
    { text: '💎 Premium', callback_data: 'creds_f_PREMIUM PERMANENT' },
    { text: '🏪 Reseller', callback_data: 'creds_f_RESELLER' }
  ]);
  buttons.push([
    { text: '🛡️ Admin', callback_data: 'creds_f_ADMIN' },
    { text: '👑 Owner',  callback_data: 'creds_f_OWNER' }
  ]);
  buttons.push([
    { text: '💀 Immortal', callback_data: 'creds_f_IMMORTAL' },
    { text: '📤 Export JSON', callback_data: 'creds_export' }
  ]);
  buttons.push([
    { text: '🌐 Semua Role', callback_data: 'creds_f_all' },
    { text: '🏠 Menu', callback_data: 'menu_back' }
  ]);

  return { text, buttons };
}

// ============================================================
// COMMAND: /creds
// ============================================================
bot.onText(/^\/creds(?:\s+([\s\S]+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const arg = (match[1] || '').trim();

  if (arg){
    const u = await fbGetUser(arg);
    if (u){
      let text = `🔐 <b>CREDENTIAL DETAIL</b>\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `👤 Username: <code>${escapeHtml(u.username)}</code>\n`;
      text += `🔑 Password: <code>${escapeHtml(u.password || '—')}</code>\n`;
      text += `🎭 Role: ${roleEmoji(u.role)} <b>${escapeHtml(u.role || '—')}</b>\n`;
      text += `📊 Status: ${u.banned ? '🚫 BANNED' : (isExpired(u) ? '⌛ EXPIRED' : '✅ ACTIVE')}\n`;
      text += `⏳ Expiry: ${u.expiry > 0 ? formatDate(u.expiry) + ' (' + expiryLabel(u) + ')' : '♾️ PERMANENT'}\n`;
      text += `💰 Balance: ${fmtRp(u.balance)}\n`;
      text += `📅 Created: ${formatDate(u.createdAt)}\n`;
      if (u.createdBy) text += `✍️ By: ${escapeHtml(u.createdBy)}\n`;
      if (u.lastLogin) text += `🕐 Last login: ${formatDate(u.lastLogin)}\n`;
      if (u.loginCount) text += `🔢 Login count: ${u.loginCount}\n`;
      return send(msg.chat.id, text);
    }

    const role = resolveRole(arg);
    if (role){
      const { text, buttons } = await buildCredsPage(1, role);
      return send(msg.chat.id, text, { reply_markup: { inline_keyboard: buttons } });
    }

    return send(msg.chat.id,
      `❌ Username atau role <b>${escapeHtml(arg)}</b> tidak ditemukan.\n\n` +
      `Gunakan:\n` +
      `<code>/creds</code> — semua akun\n` +
      `<code>/creds &lt;username&gt;</code> — detail akun\n` +
      `<code>/creds &lt;role&gt;</code> — filter role`
    );
  }

  const { text, buttons } = await buildCredsPage(1);
  send(msg.chat.id, text, { reply_markup: { inline_keyboard: buttons } });
});

// ============================================================
// COMMAND: /export
// ============================================================
bot.onText(/^\/export$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Mengumpulkan data...`);

  try {
    const [users, orders, msgs] = await Promise.all([
      fbAllUsers(),
      fbAllOrders(),
      fbAllMessages()
    ]);

    const dump = {
      exportedAt: now(),
      exportedBy: msg.from.id,
      botVersion: CONFIG.BOT_VERSION,
      totalUsers: Object.keys(users).length,
      totalOrders: Object.keys(orders).length,
      totalMessages: Object.keys(msgs).length,
      users,
      orders,
      messages: msgs
    };

    const json = JSON.stringify(dump, null, 2);
    const filename = `nyx-backup-${now()}.json`;

    await bot.sendDocument(chatId,
      Buffer.from(json, 'utf-8'),
      {
        caption:
          `📦 <b>NYX VOID BACKUP</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👥 Users: <b>${Object.keys(users).length}</b>\n` +
          `📦 Orders: <b>${Object.keys(orders).length}</b>\n` +
          `💬 Messages: <b>${Object.keys(msgs).length}</b>\n` +
          `📅 ${formatDate(now())}`
      },
      { filename, contentType: 'application/json' }
    );

    if (loading) await deleteMsg(chatId, loading.message_id);
    log.ok(`Export done: ${Object.keys(users).length} users`);
  } catch(e){
    log.error('export:', e.message);
    if (loading) await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
    else await send(chatId, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /generate
// ============================================================
bot.onText(/^\/generate(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const args = (match[1] || '').trim().split(/\s+/).filter(Boolean);

  if (args.length === 0){
    return send(chatId,
      `👤 <b>GENERATE AKUN</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `<b>Cara 1 — Cepat:</b>\n` +
      `<code>/generate immortal user1 pass123</code>\n` +
      `<code>/generate member 3 user2 pass123</code>\n` +
      `<code>/generate premium user3 pass123</code>\n\n` +
      `<b>Cara 2 — Wizard:</b>\n` +
      `Pilih role di bawah ↓`,
      ROLE_KEYBOARD
    );
  }

  const rawRole = args[0];
  const role = resolveRole(rawRole);
  if (!role){
    return send(chatId,
      `❌ Role <b>${escapeHtml(rawRole)}</b> tidak valid.\n\n` +
      `Role tersedia:\n` +
      `• <code>member</code> (harian, 1-10 hari)\n` +
      `• <code>monthly</code> (member 1 bulan)\n` +
      `• <code>premium</code>, <code>reseller</code>, <code>admin</code>\n` +
      `• <code>owner</code>, <code>immortal</code>`
    );
  }

  let expiredDays = null;
  let username, password;

  if (role === ROLE_MEMBER){
    if (args.length < 4){
      return send(chatId,
        `❌ Format member butuh 4 argumen:\n` +
        `<code>/generate member 3 user1 pass123</code>`
      );
    }
    expiredDays = parseInt(args[1], 10);
    if (isNaN(expiredDays) || expiredDays < 1 || expiredDays > 10){
      return send(chatId, `❌ Expired untuk member harus 1-10 hari.`);
    }
    username = args[2];
    password = args[3];
  } else {
    if (args.length < 3){
      return send(chatId,
        `❌ Format salah:\n` +
        `<code>/generate ${rawRole} user1 pass123</code>`
      );
    }
    username = args[1];
    password = args[2];
  }

  if (!isValidUsername(username)){
    return send(chatId,
      `❌ Username tidak valid.\n` +
      `Min 3, max 32 karakter.\n` +
      `Boleh: huruf, angka, <code>_ . -</code>`
    );
  }

  if (!isValidPassword(password)){
    return send(chatId,
      `❌ Password harus 4-64 karakter\n` +
      `dan tidak boleh mengandung: <code>* " ' _</code>`
    );
  }

  const loading = await send(chatId, `⏳ Membuat akun...`);

  try {
    const user = await fbCreateUser({ username, password, role, expiredDays });

    let text = `✅ <b>AKUN DIBUAT</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `👤 Username: <code>${escapeHtml(username)}</code>\n`;
    text += `🔑 Password: <code>${escapeHtml(password)}</code>\n`;
    text += `🎭 Role: <b>${roleEmoji(role)} ${escapeHtml(role)}</b>\n`;

    if (user.expiry > 0){
      const days = Math.ceil((user.expiry - now()) / CONFIG.DAY_MS);
      text += `⏳ Expired: <b>${days} hari</b>\n`;
      text += `📅 Sampai: ${formatDate(user.expiry)}\n`;
    } else {
      text += `♾️ Status: <b>PERMANENT</b>\n`;
    }

    text += `\n<i>Simpan credential di atas.</i>`;

    if (loading) await editMsg(chatId, loading.message_id, text);
    else await send(chatId, text);

    log.ok(`Account created: ${username} (${role}) by ${msg.from.id}`);
  } catch(e){
    log.error('createUser:', e.message);
    if (loading) await editMsg(chatId, loading.message_id, `❌ <b>GAGAL:</b> ${escapeHtml(e.message)}`);
    else await send(chatId, `❌ <b>GAGAL:</b> ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /users
// ============================================================
bot.onText(/^\/users$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Mengambil data...`);

  try {
    const users = await fbAllUsers();
    const entries = Object.entries(users);

    if (entries.length === 0){
      return editMsg(chatId, loading.message_id, `📭 Belum ada user terdaftar.`);
    }

    const byRole = {};
    entries.forEach(([k, v]) => {
      const r = v.role || 'unknown';
      byRole[r] = (byRole[r] || 0) + 1;
    });

    let text = `📋 <b>DAFTAR USER</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Total: <b>${entries.length}</b>\n\n`;

    Object.entries(byRole).forEach(([role, count]) => {
      text += `• ${roleEmoji(role)} ${role}: <b>${count}</b>\n`;
    });

    text += `\n<b>Detail (${Math.min(entries.length, CONFIG.MAX_USERS_PER_PAGE)} pertama):</b>\n`;

    entries.slice(0, CONFIG.MAX_USERS_PER_PAGE).forEach(([k, u], i) => {
      const status = u.banned ? '🚫' :
        (u.role === ROLE_MEMBER && u.expiry && now() > u.expiry ? '⌛' : '✅');
      const exp = u.expiry > 0 ? ' (' + expiryLabel(u) + ')' : '';
      text += `${i + 1}. ${status} <code>${escapeHtml(u.username)}</code>\n`;
      text += `    ${roleEmoji(u.role)} ${u.role}${exp}\n`;
    });

    if (entries.length > CONFIG.MAX_USERS_PER_PAGE){
      text += `\n<i>...dan ${entries.length - CONFIG.MAX_USERS_PER_PAGE} lainnya</i>`;
    }

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    log.error('users:', e.message);
    await editMsg(chatId, loading.message_id, `❌ Gagal: ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /user
// ============================================================
bot.onText(/^\/user(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const username = (match[1] || '').trim();
  if (!username) return send(msg.chat.id, `❌ <code>/user username</code>`);

  const u = await fbGetUser(username);
  if (!u) return send(msg.chat.id, `❌ User <b>${escapeHtml(username)}</b> tidak ditemukan.`);

  let text = `👤 <b>DETAIL USER</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `Username: <code>${escapeHtml(u.username)}</code>\n`;
  text += `Password: <code>${escapeHtml(u.password)}</code>\n`;
  text += `Role: <b>${roleEmoji(u.role)} ${escapeHtml(u.role)}</b>\n`;
  text += `Status: ${u.banned ? '🚫 BANNED' : (u.role === ROLE_MEMBER && u.expiry && now() > u.expiry ? '⌛ EXPIRED' : '✅ AKTIF')}\n`;
  text += `Balance: <b>${fmtRp(u.balance)}</b>\n`;
  text += `Login count: ${u.loginCount || 0}\n`;
  text += `Dibuat: ${formatDate(u.createdAt)}\n`;
  text += `Dibuat oleh: ${escapeHtml(u.createdBy || '-')}\n`;

  if (u.lastLogin) text += `Login terakhir: ${formatDate(u.lastLogin)}\n`;

  if (u.expiry > 0){
    const sisa = Math.max(0, Math.ceil((u.expiry - now()) / CONFIG.DAY_MS));
    text += `Expired: ${formatDate(u.expiry)} (${sisa} hari lagi)\n`;
  } else {
    text += `Expired: <b>PERMANENT</b>\n`;
  }

  send(msg.chat.id, text);
});

// ============================================================
// COMMAND: /delete
// ============================================================
bot.onText(/^\/delete(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const username = (match[1] || '').trim();
  if (!username) return send(msg.chat.id, `❌ <code>/delete username</code>`);

  try {
    await fbDeleteUser(username);
    send(msg.chat.id, `✅ User <b>${escapeHtml(username)}</b> dihapus.`);
    log.ok(`User deleted: ${username} by ${msg.from.id}`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /ban
// ============================================================
bot.onText(/^\/ban(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const username = (match[1] || '').trim();
  if (!username) return send(msg.chat.id, `❌ <code>/ban username</code>`);

  try {
    await fbBanUser(username, true);
    send(msg.chat.id, `🚫 User <b>${escapeHtml(username)}</b> diblokir.`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /unban
// ============================================================
bot.onText(/^\/unban(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const username = (match[1] || '').trim();
  if (!username) return send(msg.chat.id, `❌ <code>/unban username</code>`);

  try {
    await fbBanUser(username, false);
    send(msg.chat.id, `✅ User <b>${escapeHtml(username)}</b> dibuka blokirnya.`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /setrole
// ============================================================
bot.onText(/^\/setrole(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const args = (match[1] || '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) return send(msg.chat.id, `❌ <code>/setrole username role</code>`);

  const username = args[0];
  const rawRole = args.slice(1).join(' ');
  const role = resolveRole(rawRole);
  if (!role) return send(msg.chat.id, `❌ Role tidak valid: ${escapeHtml(rawRole)}`);

  try {
    await fbSetRole(username, role);
    send(msg.chat.id, `✅ Role <b>${escapeHtml(username)}</b> → ${roleEmoji(role)} <b>${role}</b>`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /setexp
// ============================================================
bot.onText(/^\/setexp(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const args = (match[1] || '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) return send(msg.chat.id, `❌ <code>/setexp username days</code> (0=permanent)`);

  const username = args[0];
  const days = parseInt(args[1], 10);
  if (isNaN(days) || days < 0) return send(msg.chat.id, `❌ Days harus angka >= 0`);

  try {
    const expiry = await fbSetExpiry(username, days);
    send(msg.chat.id, `✅ Expiry <b>${escapeHtml(username)}</b> → ` +
      (expiry ? formatDate(expiry) : '<b>PERMANENT</b>'));
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /setbal
// ============================================================
bot.onText(/^\/setbal(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const args = (match[1] || '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) return send(msg.chat.id, `❌ <code>/setbal username amount</code>`);

  const username = args[0];
  const amount = parseInt(args[1], 10);
  if (isNaN(amount) || amount < 0) return send(msg.chat.id, `❌ Amount harus angka >= 0`);

  try {
    await fbSetBalance(username, amount);
    send(msg.chat.id, `✅ Balance <b>${escapeHtml(username)}</b> → ${fmtRp(amount)}`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /setpass
// ============================================================
bot.onText(/^\/setpass(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const args = (match[1] || '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) return send(msg.chat.id, `❌ <code>/setpass username newpassword</code>`);

  const username = args[0];
  const newPass = args.slice(1).join(' ');

  try {
    await fbSetPassword(username, newPass);
    send(msg.chat.id, `✅ Password <b>${escapeHtml(username)}</b> diubah.`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /orders
// ============================================================
bot.onText(/^\/orders$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Mengambil orders...`);

  try {
    const orders = await fbAllOrders();
    const entries = Object.values(orders).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!entries.length){
      return editMsg(chatId, loading.message_id, `📭 Belum ada order.`);
    }

    const pending = entries.filter(o => o.status === 'PENDING' || o.status === 'PROCESSING');
    const completed = entries.filter(o => o.status === 'COMPLETED');
    const rejected = entries.filter(o => o.status === 'REJECTED');

    let text = `📦 <b>ORDERS</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Total: <b>${entries.length}</b>\n`;
    text += `⏳ Pending: <b>${pending.length}</b>\n`;
    text += `✅ Completed: <b>${completed.length}</b>\n`;
    text += `❌ Rejected: <b>${rejected.length}</b>\n\n`;

    if (pending.length){
      text += `<b>⏳ PENDING:</b>\n\n`;
      pending.slice(0, CONFIG.MAX_ORDERS_PER_PAGE).forEach(o => {
        const durasi = o.roleType === 'permanent' ? 'PERM' : (o.days || 0) + 'd';
        text += `🆔 <code>${escapeHtml(o.id)}</code>\n`;
        text += `👤 ${escapeHtml(o.buyer)} → ${escapeHtml(o.roleName)} (${durasi})\n`;
        text += `💰 ${fmtRp(o.price)}\n`;
        text += `✅ <code>/approve ${escapeHtml(o.id)}</code>\n\n`;
      });
    }

    const recent = completed.slice(0, 5);
    if (recent.length){
      text += `<b>✅ RECENT COMPLETED:</b>\n`;
      recent.forEach(o => {
        text += `• <code>${escapeHtml(o.id.slice(-12))}</code> — ${escapeHtml(o.buyer)} (${escapeHtml(o.roleName)})\n`;
      });
    }

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    log.error('orders:', e.message);
    await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /pending
// ============================================================
bot.onText(/^\/pending$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Loading...`);

  try {
    const orders = await fbAllOrders();
    const pending = Object.values(orders)
      .filter(o => o.status === 'PENDING' || o.status === 'PROCESSING')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!pending.length){
      return editMsg(chatId, loading.message_id, `✅ Tidak ada order pending.`);
    }

    let text = `⏳ <b>PENDING ORDERS (${pending.length})</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    pending.forEach(o => {
      const durasi = o.roleType === 'permanent' ? 'PERMANENT' : (o.days || 0) + ' hari';
      text += `🆔 <code>${escapeHtml(o.id)}</code>\n`;
      text += `👤 Buyer: <b>${escapeHtml(o.buyer)}</b>\n`;
      text += `🎭 Role: ${escapeHtml(o.roleName)} — ${durasi}\n`;
      text += `🔐 User: <code>${escapeHtml(o.accountUser)}</code>\n`;
      text += `🔑 Pass: <code>${escapeHtml(o.accountPass)}</code>\n`;
      text += `💰 ${fmtRp(o.price)}\n`;
      text += `✅ <code>/approve ${escapeHtml(o.id)}</code>\n`;
      text += `❌ <code>/reject ${escapeHtml(o.id)}</code>\n\n`;
    });

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /order <id>
// ============================================================
bot.onText(/^\/order(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const orderId = (match[1] || '').trim();
  if (!orderId) return send(msg.chat.id, `❌ <code>/order ORDER-ID</code>`);

  try {
    const o = await fbGetOrder(orderId);
    if (!o) return send(msg.chat.id, `❌ Order tidak ditemukan.`);

    const durasi = o.roleType === 'permanent' ? 'PERMANENT' : (o.days || 0) + ' hari';
    let text = `📦 <b>DETAIL ORDER</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `🆔 ID: <code>${escapeHtml(o.id)}</code>\n`;
    text += `👤 Buyer: <b>${escapeHtml(o.buyer)}</b>\n`;
    text += `🎭 Role: ${escapeHtml(o.roleName)}\n`;
    text += `⏱️ Durasi: ${durasi}\n`;
    text += `💰 Harga: <b>${fmtRp(o.price)}</b>\n`;
    text += `🔐 Username: <code>${escapeHtml(o.accountUser)}</code>\n`;
    text += `🔑 Password: <code>${escapeHtml(o.accountPass)}</code>\n`;
    text += `📊 Status: <b>${o.status}</b>\n`;
    text += `📅 Dibuat: ${formatDate(o.createdAt)}\n`;

    if (o.completedAt) text += `✅ Completed: ${formatDate(o.completedAt)}\n`;
    if (o.approvedRole) text += `🎯 Final Role: <b>${escapeHtml(o.approvedRole)}</b>\n`;

    if (o.status === 'PENDING' || o.status === 'PROCESSING'){
      text += `\n✅ <code>/approve ${escapeHtml(o.id)}</code>\n`;
      text += `❌ <code>/reject ${escapeHtml(o.id)}</code>`;
    }

    send(msg.chat.id, text);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /approve
// ============================================================
bot.onText(/^\/approve(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const orderId = (match[1] || '').trim();
  if (!orderId) return send(msg.chat.id, `❌ <code>/approve ORDER-ID</code>`);

  const loading = await send(msg.chat.id, `⏳ Approving...`);

  try {
    const r = await fbApproveOrder(orderId);
    const o = r.order;
    const durasi = o.roleType === 'permanent' ? 'PERMANENT' : (o.days || 0) + ' hari';

    let text = `✅ <b>ORDER APPROVED</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `🆔 <code>${escapeHtml(orderId)}</code>\n`;
    text += `👤 Buyer: <b>${escapeHtml(o.buyer)}</b>\n`;
    text += `🎭 Role: ${escapeHtml(o.roleName)} (${durasi})\n`;
    text += `🎯 Final Role: <b>${escapeHtml(r.finalRole)}</b>\n`;
    text += `🔐 Username: <code>${escapeHtml(o.accountUser)}</code>\n`;
    text += `🔑 Password: <code>${escapeHtml(o.accountPass)}</code>\n`;

    if (r.expiry > 0) text += `⏳ Expiry: ${formatDate(r.expiry)}\n`;
    else text += `♾️ Status: PERMANENT\n`;

    text += `\n${r.created ? '📝 Akun baru dibuat di sistem.' : '⚠️ Akun sudah ada, di-update.'}`;

    await editMsg(msg.chat.id, loading.message_id, text);
    log.ok(`Order approved: ${orderId} → user ${o.accountUser} (${r.finalRole})`);
  } catch(e){
    await editMsg(msg.chat.id, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /reject
// ============================================================
bot.onText(/^\/reject(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const orderId = (match[1] || '').trim();
  if (!orderId) return send(msg.chat.id, `❌ <code>/reject ORDER-ID</code>`);

  try {
    await fbRejectOrder(orderId);
    send(msg.chat.id, `❌ Order <code>${escapeHtml(orderId)}</code> ditolak.`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /msgs
// ============================================================
bot.onText(/^\/msgs$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Loading...`);

  try {
    const msgs = await fbAllMessages();
    const unread = Object.values(msgs)
      .filter(m => m.from === 'user' && !m.readByDev)
      .sort((a, b) => b.time - a.time);

    if (!unread.length){
      return editMsg(chatId, loading.message_id, `✅ Tidak ada pesan CS unread.`);
    }

    let text = `📩 <b>UNREAD CS (${unread.length})</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    unread.slice(0, 10).forEach(m => {
      text += `👤 <b>${escapeHtml(m.senderName || m.user)}</b>\n`;
      text += `💬 <i>${escapeHtml(m.text)}</i>\n`;
      text += `🕐 ${formatDate(m.time)}\n`;
      text += `↩️ <code>/reply ${escapeHtml(m.user)} pesan</code>\n\n`;
    });

    if (unread.length > 10){
      text += `<i>...dan ${unread.length - 10} lainnya</i>`;
    }

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /convo <user>
// ============================================================
bot.onText(/^\/convo(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const targetUser = (match[1] || '').trim();
  if (!targetUser) return send(msg.chat.id, `❌ <code>/convo username</code>`);

  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Loading chat...`);

  try {
    const msgs = await fbAllMessages();
    const targetLower = targetUser.toLowerCase();
    const conv = Object.values(msgs)
      .filter(m =>
        String(m.user || '').toLowerCase() === targetLower ||
        String(m.target || '').toLowerCase() === targetLower
      )
      .sort((a, b) => a.time - b.time);

    if (!conv.length){
      return editMsg(chatId, loading.message_id,
        `📭 Tidak ada percakapan dengan <b>${escapeHtml(targetUser)}</b>.`);
    }

    await fbMarkRead(targetUser);

    let text = `💬 <b>CHAT: ${escapeHtml(targetUser)}</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    conv.slice(-15).forEach(m => {
      const who = m.from === 'user'
        ? '👤 ' + (m.senderName || targetUser)
        : '⚙️ ' + (m.senderName || 'DEV');
      const t = new Date(m.time).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      });
      text += `<b>[${t}]</b> ${who}:\n${escapeHtml(m.text)}\n\n`;
    });

    if (conv.length > 15){
      text = `<i>...15 pesan terakhir dari ${conv.length} total</i>\n\n` + text;
    }

    text += `↩️ Balas:\n<code>/reply ${escapeHtml(targetUser)} pesan kamu</code>`;

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /reply <user> <text>
// ============================================================
bot.onText(/^\/reply(?:\s+([\s\S]+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const full = (match[1] || '').trim();
  if (!full) return send(msg.chat.id, `❌ <code>/reply username pesan balasan</code>`);

  const parts = full.split(/\s+/);
  if (parts.length < 2){
    return send(msg.chat.id, `❌ <code>/reply username pesan balasan</code>`);
  }

  const targetUser = parts[0];
  const text = parts.slice(1).join(' ');

  try {
    const u = await fbGetUser(targetUser);
    if (!u) return send(msg.chat.id, `❌ User <b>${escapeHtml(targetUser)}</b> tidak ditemukan.`);

    await fbSendDevReply(targetUser, text, CONFIG.DEV_USERNAME);

    send(msg.chat.id,
      `✅ Balasan terkirim ke <b>${escapeHtml(targetUser)}</b>:\n\n<i>${escapeHtml(text)}</i>`
    );
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /maintweb — WEB MAINTENANCE (website.html)
// ============================================================
bot.onText(/^\/maintweb(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const args = (match[1] || '').trim();

  // --- Tampil Status ---
  if (!args){
    const m = await fbGetMaintenanceWeb();
    let text = `🌐 <b>WEB MAINTENANCE MODE</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Target: <b>website.html</b>\n`;
    text += `Status: <b>${m.enabled ? '🟢 AKTIF' : '⚫ OFF'}</b>\n`;
    if (m.message) text += `Pesan: ${escapeHtml(m.message)}\n`;
    if (m.link) text += `Link: ${escapeHtml(m.link)}\n`;
    if (m.updatedBy) text += `By: ${escapeHtml(m.updatedBy)}\n`;
    text += `\n<b>Ubah:</b>\n`;
    text += `<code>/maintweb on Pesan maintenance</code>\n`;
    text += `<code>/maintweb off</code>\n`;
    text += `<code>/maintweb set Pesan baru</code>\n`;
    text += `<code>/maintweb link https://...</code>`;
    return send(chatId, text);
  }

  const parts = args.split(/\s+/);
  const state = parts[0].toLowerCase();

  // --- ON ---
  if (state === 'on'){
    const message = parts.slice(1).join(' ') ||
      'Website sedang dalam pemeliharaan. Silakan coba lagi nanti.';

    await fbSetMaintenanceWeb({
      enabled: true,
      message,
      since: now(),
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });

    return send(chatId,
      `🌐 Web Maintenance <b>AKTIF</b>\n\n` +
      `Target: <b>website.html</b>\n` +
      `Pesan: ${escapeHtml(message)}`
    );
  }

  // --- OFF ---
  if (state === 'off'){
    await fbSetMaintenanceWeb({
      enabled: false,
      message: '',
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });

    return send(chatId,
      `⚫ Web Maintenance <b>OFF</b>\n\n` +
      `Target: <b>website.html</b>`
    );
  }

  // --- SET pesan ---
  if (state === 'set'){
    const customMsg = parts.slice(1).join(' ').trim();
    if (!customMsg) return send(chatId, `❌ Gunakan: <code>/maintweb set Pesan kamu</code>`);

    await fbSetMaintenanceWeb({
      message: customMsg,
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });

    return send(chatId, `✅ Pesan web → ${escapeHtml(customMsg)}`);
  }

  // --- LINK ---
  if (state === 'link'){
    const link = parts.slice(1).join(' ').trim();
    if (!link) return send(chatId, `❌ Gunakan: <code>/maintweb link https://...</code>`);

    await fbSetMaintenanceWeb({
      link,
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });

    return send(chatId, `✅ Link web update → <code>${escapeHtml(link)}</code>`);
  }

  send(chatId, `❌ Gunakan: <code>on</code>, <code>off</code>, <code>set</code>, atau <code>link</code>`);
});

// ============================================================
// COMMAND: /maintenance — GLOBAL (index.html)
// ============================================================
bot.onText(/^\/maintenance(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const args = (match[1] || '').trim();

  // --- Tampil Status ---
  if (!args){
    const m = await fbGetMaintenance();
    let text = `🔧 <b>MAINTENANCE MODE (GLOBAL)</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Target: <b>index.html</b>\n`;
    text += `Status: <b>${m.enabled ? '🟢 AKTIF' : '⚫ OFF'}</b>\n`;
    if (m.message) text += `Pesan: ${escapeHtml(m.message)}\n`;
    if (m.link) text += `Link: ${escapeHtml(m.link)}\n`;
    text += `\n<b>Ubah:</b>\n`;
    text += `<code>/maintenance on Pesan maintenance</code>\n`;
    text += `<code>/maintenance off</code>`;
    return send(chatId, text);
  }

  const parts = args.split(/\s+/);
  const state = parts[0].toLowerCase();

  // --- ON ---
  if (state === 'on'){
    const message = parts.slice(1).join(' ') ||
      'Server dalam pemeliharaan. Silakan coba lagi nanti.';

    await fbSetMaintenance({
      enabled: true,
      message,
      since: now(),
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });

    return send(chatId, `🟢 Maintenance <b>AKTIF</b>\n\nPesan: ${escapeHtml(message)}`);
  }

  // --- OFF ---
  if (state === 'off'){
    await fbSetMaintenance({
      enabled: false,
      message: '',
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });

    return send(chatId, `⚫ Maintenance <b>OFF</b>`);
  }

  send(chatId, `❌ Gunakan <code>on</code> atau <code>off</code>`);
});

// ============================================================
// COMMAND: /stopall — KILL SWITCH GLOBAL
// ============================================================
bot.onText(/^\/stopall$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ <b>FORCE-STOPPING ALL SYSTEMS...</b>`);

  try {
    const timestamp = now();
    const updates = {};

    // ─── 1. Force disable GLOBAL maintenance (index.html)
    updates['nyx/maintenance/enabled']    = false;
    updates['nyx/maintenance/message']    = '';
    updates['nyx/maintenance/link']       = '';
    updates['nyx/maintenance/since']      = 0;
    updates['nyx/maintenance/updatedAt']  = timestamp;
    updates['nyx/maintenance/updatedBy']  = 'bot:stopall';

    // ─── 2. Force disable WEB maintenance (website.html)
    updates['nyx/maintenanceWeb/enabled']    = false;
    updates['nyx/maintenanceWeb/message']    = '';
    updates['nyx/maintenanceWeb/link']       = '';
    updates['nyx/maintenanceWeb/since']      = 0;
    updates['nyx/maintenanceWeb/updatedAt']  = timestamp;
    updates['nyx/maintenanceWeb/updatedBy']  = 'bot:stopall';

    // ─── 3. Clear announcement (opsional, biar clean)
    updates['nyx/announce'] = null;

    // ─── 4. Set GLOBAL STOPALL TRIGGER
    // Semua client yang listen akan fire reset
    updates['nyx/stopall/enabled']    = true;
    updates['nyx/stopall/at']         = timestamp;
    updates['nyx/stopall/by']         = 'bot:' + msg.from.id;
    updates['nyx/stopall/scope']      = 'ALL';        // ALL = website + index
    updates['nyx/stopall/ttl']        = timestamp + 30000; // 30s
    updates['nyx/stopall/version']    = CONFIG.BOT_VERSION;

    // ─── 5. Commit atomik (sekali tulis, semua kebaca)
    await update(ref(db), updates);

    // ─── 6. Auto-cleanup trigger setelah 30 detik
    setTimeout(async () => {
      try {
        await update(ref(db, 'nyx/stopall'), {
          enabled: false,
          clearedAt: now()
        });
        log.info('[stopall] flag auto-cleared after 30s');
      } catch(e){
        log.warn('[stopall] cleanup failed:', e.message);
      }
    }, 30000);

    // ─── 7. Confirmation reply
    let text = `🛑 <b>STOP ALL — EXECUTED</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `✅ Maintenance <b>index.html</b> → OFF\n`;
    text += `✅ Maintenance <b>website.html</b> → OFF\n`;
    text += `✅ Announcement → cleared\n`;
    text += `✅ Stopall broadcast → <b>ACTIVE</b> (30s)\n\n`;
    text += `📡 <b>Semua client aktif</b> akan:\n`;
    text += `• Force close maintenance overlay\n`;
    text += `• Force logout user (reset session)\n`;
    text += `• Force reload page\n\n`;
    text += `<i>Efek terasa dalam 1-3 detik.</i>\n`;
    text += `<i>Trigger auto-clear dalam 30 detik.</i>`;

    await editMsg(chatId, loading.message_id, text);
    log.ok(`[STOPALL] Executed by ${msg.from.id}`);

    // ─── 8. Notif ke developer lain
    CONFIG.DEV_IDS.forEach(id => {
      if (id === msg.from.id) return;
      send(id,
        `🛑 <b>STOPALL dijalankan</b>\n\n` +
        `Oleh: <code>${msg.from.id}</code>\n` +
        `Waktu: ${formatDate(timestamp)}`
      );
    });

  } catch(e){
    log.error('[stopall]:', e.message);
    await editMsg(chatId, loading.message_id, `❌ <b>GAGAL:</b> ${escapeHtml(e.message)}`);
  }
});


// ============================================================
// COMMAND: /broadcast
// ============================================================
bot.onText(/^\/broadcast(?:\s+([\s\S]+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const text = (match[1] || '').trim();
  if (!text) return send(msg.chat.id, `❌ <code>/broadcast pesan kamu</code>`);

  try {
    const sessions = await fbAllSessions();
    const tokens = Object.keys(sessions);

    await fbSetAnnounce(text, 'bot:' + msg.from.id);

    let reply = `📢 <b>BROADCAST TERKIRIM</b>\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    reply += `Target: <b>${tokens.length}</b> session\n`;
    reply += `Pesan: ${escapeHtml(text)}\n\n`;
    reply += `<i>User akan melihat notifikasi saat refresh aplikasi.</i>`;

    send(msg.chat.id, reply);
    log.ok(`Broadcast: ${text.slice(0, 30)}... → ${tokens.length} sessions`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /clearannounce
// ============================================================
bot.onText(/^\/clearannounce$/, async (msg) => {
  if (!requireDev(msg)) return;

  try {
    await fbClearAnnounce();
    send(msg.chat.id, `🗑️ Announcement telah dihapus.`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /stats
// ============================================================
bot.onText(/^\/stats$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Menghitung...`);

  try {
    const s = await fbGetStats();

    let text = `📊 <b>STATISTIK NYX VOID</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `<b>👥 USERS:</b>\n`;
    text += `Total: <b>${s.users.length}</b>\n`;
    text += `Aktif: <b>${s.active}</b>\n`;
    text += `Banned: <b>${s.banned}</b>\n`;
    text += `Expired: <b>${s.expired}</b>\n\n`;

    text += `<b>🎭 PER ROLE:</b>\n`;
    Object.entries(s.byRole).forEach(([r, c]) => {
      text += `• ${roleEmoji(r)} ${r}: <b>${c}</b>\n`;
    });
    text += `\n`;

    text += `<b>📦 ORDERS:</b>\n`;
    text += `Total: <b>${s.orders.length}</b>\n`;
    text += `Completed: <b>${s.completed}</b>\n`;
    text += `Pending: <b>${s.pending}</b>\n`;
    text += `Revenue: <b>${fmtRp(s.revenue)}</b>\n\n`;

    text += `<b>💻 SESSIONS:</b>\n`;
    text += `Total: <b>${s.sessions}</b>\n`;
    text += `Online (~5m): <b>${s.onlineSessions}</b>\n\n`;

    text += `<b>🔧 MAINTENANCE:</b>\n`;
    text += `Global (index): ${s.maintenance.enabled ? '🟢 AKTIF' : '⚫ OFF'}\n`;
    text += `Web (website): ${s.maintenanceWeb.enabled ? '🟢 AKTIF' : '⚫ OFF'}\n\n`;

    text += `<b>⚙️ SYSTEM:</b>\n`;
    text += `Bot version: <b>v${CONFIG.BOT_VERSION}</b>\n`;
    text += `Bot uptime: ${Math.floor(process.uptime() / 60)} menit\n`;
    text += `Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    log.error('stats:', e.message);
    await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /sessions
// ============================================================
bot.onText(/^\/sessions$/, async (msg) => {
  if (!requireDev(msg)) return;
  const chatId = msg.chat.id;
  const loading = await send(chatId, `⏳ Mengambil sessions...`);

  try {
    const sessions = await fbAllSessions();
    const entries = Object.entries(sessions);

    if (entries.length === 0){
      return editMsg(chatId, loading.message_id, `📭 Belum ada session.`);
    }

    const n = now();
    let text = `💻 <b>SESSIONS</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Total: <b>${entries.length}</b>\n\n`;

    entries.slice(0, 12).forEach(([token, s], i) => {
      const online = (n - (s.lastSeen || 0)) < CONFIG.ONLINE_THRESHOLD_MS;
      text += `${i + 1}. ${online ? '🟢' : '⚫'} <b>${escapeHtml(s.username || '-')}</b> (${escapeHtml(s.role || '-')})\n`;
      text += `   🕐 ${formatDate(s.lastSeen)}\n`;
    });

    if (entries.length > 12){
      text += `\n<i>...dan ${entries.length - 12} lagi</i>`;
    }

    await editMsg(chatId, loading.message_id, text);
  } catch(e){
    await editMsg(chatId, loading.message_id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /clearsessions
// ============================================================
bot.onText(/^\/clearsessions(?:\s+(\d+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const days = parseInt(match[1] || '7', 10);

  try {
    const count = await fbClearOldSessions(days);
    send(msg.chat.id, `✅ <b>${count}</b> session lama (>${days} hari) dihapus.`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /settings
// ============================================================
bot.onText(/^\/settings$/, async (msg) => {
  if (!requireDev(msg)) return;
  const s = await fbGetSettings();

  let text = `⚙️ <b>SETTINGS</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `App name: <b>${escapeHtml(s.appName || 'NYX VOID')}</b>\n`;
  text += `WhatsApp: ${escapeHtml(s.wa || '-')}\n`;
  text += `Telegram: ${escapeHtml(s.tg || '-')}\n`;
  text += `TikTok: ${escapeHtml(s.tt || '-')}\n\n`;
  text += `<b>Ubah:</b>\n`;
  text += `<code>/setapp Nama</code>\n`;
  text += `<code>/setwa https://wa.me/628xxx</code>\n`;
  text += `<code>/settg https://t.me/xxx</code>\n`;
  text += `<code>/settt https://tiktok.com/@xxx</code>`;

  send(msg.chat.id, text);
});

// ============================================================
// COMMAND: /setapp
// ============================================================
bot.onText(/^\/setapp(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const v = (match[1] || '').trim();
  if (!v) return send(msg.chat.id, `❌ <code>/setapp Nama</code>`);

  try {
    await fbSetSettings({ appName: v });
    send(msg.chat.id, `✅ App name → <b>${escapeHtml(v)}</b>`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /setwa
// ============================================================
bot.onText(/^\/setwa(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const v = (match[1] || '').trim();
  if (!v) return send(msg.chat.id, `❌ <code>/setwa url</code>`);

  try {
    await fbSetSettings({ wa: v });
    send(msg.chat.id, `✅ WhatsApp → ${escapeHtml(v)}`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /settg
// ============================================================
bot.onText(/^\/settg(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const v = (match[1] || '').trim();
  if (!v) return send(msg.chat.id, `❌ <code>/settg url</code>`);

  try {
    await fbSetSettings({ tg: v });
    send(msg.chat.id, `✅ Telegram → ${escapeHtml(v)}`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /settt
// ============================================================
bot.onText(/^\/settt(?:\s+(.+))?$/, async (msg, match) => {
  if (!requireDev(msg)) return;
  const v = (match[1] || '').trim();
  if (!v) return send(msg.chat.id, `❌ <code>/settt url</code>`);

  try {
    await fbSetSettings({ tt: v });
    send(msg.chat.id, `✅ TikTok → ${escapeHtml(v)}`);
  } catch(e){
    send(msg.chat.id, `❌ ${escapeHtml(e.message)}`);
  }
});

// ============================================================
// COMMAND: /cancel
// ============================================================
bot.onText(/^\/cancel$/, (msg) => {
  if (!isDev(msg.from.id)) return;
  clearState(msg.chat.id);
  send(msg.chat.id, `❌ Dibatalkan.`);
});

// ============================================================
// CALLBACK QUERY HANDLER
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const msgId = query.message.message_id;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch(e){}

  if (!isDev(userId)){
    return bot.sendMessage(chatId, `🚫 Akses ditolak.`);
  }

  // ============ MENU: GENERATE ============
  if (data === 'menu_generate'){
    return editMsg(chatId, msgId,
      `👤 <b>GENERATE AKUN</b>\n\nPilih role:`,
      ROLE_KEYBOARD
    );
  }

  // ============ MENU: CREDS ============
  if (data === 'menu_creds'){
    const { text, buttons } = await buildCredsPage(1);
    return editMsg(chatId, msgId, text, { reply_markup: { inline_keyboard: buttons } });
  }

  // ============ MENU: EXPORT ============
  if (data === 'menu_export'){
    try {
      const [users, orders, msgs] = await Promise.all([
        fbAllUsers(),
        fbAllOrders(),
        fbAllMessages()
      ]);
      const dump = {
        exportedAt: now(),
        exportedBy: userId,
        botVersion: CONFIG.BOT_VERSION,
        totalUsers: Object.keys(users).length,
        totalOrders: Object.keys(orders).length,
        totalMessages: Object.keys(msgs).length,
        users,
        orders,
        messages: msgs
      };
      const json = JSON.stringify(dump, null, 2);
      await bot.sendDocument(chatId,
        Buffer.from(json, 'utf-8'),
        {
          caption:
            `📦 <b>NYX VOID BACKUP</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 Users: <b>${Object.keys(users).length}</b>\n` +
            `📦 Orders: <b>${Object.keys(orders).length}</b>\n` +
            `💬 Messages: <b>${Object.keys(msgs).length}</b>\n` +
            `📅 ${formatDate(now())}`
        },
        { filename: `nyx-backup-${now()}.json`, contentType: 'application/json' }
      );
    } catch(e){
      log.error('menu_export:', e.message);
      send(chatId, `❌ Export gagal: ${escapeHtml(e.message)}`);
    }
    return;
  }

  // ============ MENU: USERS ============
  if (data === 'menu_users'){
    const users = await fbAllUsers();
    const entries = Object.entries(users);
    let text = `📋 <b>DAFTAR USER</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (entries.length === 0){
      text += `Belum ada user.`;
    } else {
      text += `Total: <b>${entries.length}</b>\n\n`;
      entries.slice(0, 15).forEach(([k, u], i) => {
        const s = u.banned ? '🚫' : '✅';
        text += `${i+1}. ${s} <code>${escapeHtml(u.username)}</code> — ${roleEmoji(u.role)} ${u.role}\n`;
      });
    }

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

  // ============ MENU: ORDERS ============
  if (data === 'menu_orders'){
    const orders = await fbAllOrders();
    const entries = Object.values(orders).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const pending = entries.filter(o => o.status === 'PENDING' || o.status === 'PROCESSING');

    let text = `📦 <b>ORDERS</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Total: <b>${entries.length}</b>\n`;
    text += `Pending: <b>${pending.length}</b>\n\n`;

    if (pending.length){
      text += `<b>PENDING:</b>\n`;
      pending.slice(0, 8).forEach(o => {
        text += `• <code>${escapeHtml(o.id)}</code>\n  ${escapeHtml(o.buyer)} → ${escapeHtml(o.roleName)}\n`;
      });
      text += `\nGunakan /pending untuk detail lengkap.`;
    } else {
      text += `✅ Tidak ada order pending.`;
    }

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

  // ============ MENU: CS ============
  if (data === 'menu_cs'){
    const msgs = await fbAllMessages();
    const unread = Object.values(msgs).filter(m => m.from === 'user' && !m.readByDev);

    let text = `💬 <b>CUSTOMER SERVICE</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Unread: <b>${unread.length}</b>\n\n`;

    if (unread.length){
      text += `<b>Belum dibalas:</b>\n`;
      unread.slice(0, 8).forEach(m => {
        text += `• <b>${escapeHtml(m.senderName || m.user)}</b>\n  _${escapeHtml((m.text || '').slice(0, 50))}${(m.text || '').length > 50 ? '...' : ''}_\n`;
      });
      text += `\nGunakan /msgs untuk detail.`;
    } else {
      text += `✅ Semua pesan sudah dibalas.`;
    }

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

  // ============ MENU: STATS ============
  if (data === 'menu_stats'){
    const s = await fbGetStats();

    let text = `📊 <b>STATISTIK</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `Users: <b>${s.users.length}</b>\n`;
    text += `Orders: <b>${s.orders.length}</b>\n`;
    text += `Pending: <b>${s.pending}</b>\n`;
    text += `Revenue: <b>${fmtRp(s.revenue)}</b>\n`;
    text += `Sessions: <b>${s.sessions}</b> (${s.onlineSessions} online)\n`;
    text += `Maint Global: <b>${s.maintenance.enabled ? 'ON' : 'OFF'}</b>\n`;
    text += `Maint Web: <b>${s.maintenanceWeb.enabled ? 'ON' : 'OFF'}</b>\n`;

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

  // ============ MENU: MAINTENANCE ============
  if (data === 'menu_maintenance'){
    const [m, mw] = await Promise.all([
      fbGetMaintenance(),
      fbGetMaintenanceWeb()
    ]);

    let text = `🔧 <b>MAINTENANCE MENU</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `<b>Global (index.html):</b>\n`;
    text += `Status: <b>${m.enabled ? '🟢 AKTIF' : '⚫ OFF'}</b>\n`;
    if (m.message) text += `Pesan: ${escapeHtml(m.message)}\n`;
    text += `\n<b>Web (website.html):</b>\n`;
    text += `Status: <b>${mw.enabled ? '🟢 AKTIF' : '⚫ OFF'}</b>\n`;
    if (mw.message) text += `Pesan: ${escapeHtml(mw.message)}\n`;
    text += `\nAtau pakai command:\n`;
    text += `<code>/maintenance on pesan</code> → 🔧 global\n`;
    text += `<code>/maintweb on pesan</code> → 🌐 web`;

    return editMsg(chatId, msgId, text, MAINT_MENU);
  }

  if (data === 'maint_global_view'){
    const m = await fbGetMaintenance();
    const buttons = m.enabled
      ? [[{ text: '⚫ Matikan Global', callback_data: 'maint_global_off' }]]
      : [[{ text: '🟢 Nyalakan Global', callback_data: 'maint_global_on' }]];
    buttons.push([{ text: '⬅️ Kembali', callback_data: 'menu_maintenance' }]);

    return editMsg(chatId, msgId,
      `🔧 <b>MAINTENANCE GLOBAL</b>\n` +
      `Target: <b>index.html</b>\n\n` +
      `Status: <b>${m.enabled ? '🟢 AKTIF' : '⚫ OFF'}</b>\n` +
      (m.message ? `Pesan: ${escapeHtml(m.message)}\n` : ''),
      { reply_markup: { inline_keyboard: buttons } }
    );
  }

  if (data === 'maint_web_view'){
    const m = await fbGetMaintenanceWeb();
    const buttons = m.enabled
      ? [[{ text: '⚫ Matikan Web', callback_data: 'maint_web_off' }]]
      : [[{ text: '🟢 Nyalakan Web', callback_data: 'maint_web_on' }]];
    buttons.push([{ text: '⬅️ Kembali', callback_data: 'menu_maintenance' }]);

    return editMsg(chatId, msgId,
      `🌐 <b>MAINTENANCE WEB</b>\n` +
      `Target: <b>website.html</b>\n\n` +
      `Status: <b>${m.enabled ? '🟢 AKTIF' : '⚫ OFF'}</b>\n` +
      (m.message ? `Pesan: ${escapeHtml(m.message)}\n` : ''),
      { reply_markup: { inline_keyboard: buttons } }
    );
  }

  if (data === 'maint_global_on'){
    await fbSetMaintenance({
      enabled: true,
      message: 'Server dalam pemeliharaan.',
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });
    return editMsg(chatId, msgId, `🟢 Maintenance Global <b>AKTIF</b>`, BACK_BTN);
  }

  if (data === 'maint_global_off'){
    await fbSetMaintenance({
      enabled: false,
      message: '',
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });
    return editMsg(chatId, msgId, `⚫ Maintenance Global <b>OFF</b>`, BACK_BTN);
  }

  if (data === 'maint_web_on'){
    await fbSetMaintenanceWeb({
      enabled: true,
      message: 'Website dalam pemeliharaan.',
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });
    return editMsg(chatId, msgId, `🟢 Maintenance Web <b>AKTIF</b>`, BACK_BTN);
  }

  if (data === 'maint_web_off'){
    await fbSetMaintenanceWeb({
      enabled: false,
      message: '',
      updatedAt: now(),
      updatedBy: 'bot:' + CONFIG.BOT_NAME
    });
    return editMsg(chatId, msgId, `⚫ Maintenance Web <b>OFF</b>`, BACK_BTN);
  }

  // ============ MENU: SETTINGS ============
  if (data === 'menu_settings'){
    const s = await fbGetSettings();

    let text = `⚙️ <b>SETTINGS</b>\n\n`;
    text += `App: <b>${escapeHtml(s.appName || 'NYX VOID')}</b>\n`;
    text += `WA: ${escapeHtml(s.wa || '-')}\n`;
    text += `TG: ${escapeHtml(s.tg || '-')}\n`;
    text += `TT: ${escapeHtml(s.tt || '-')}\n\n`;
    text += `Ubah via command:\n<code>/setapp /setwa /settg /settt</code>`;

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

  // ============ MENU: SESSIONS ============
  if (data === 'menu_sessions'){
    const sessions = await fbAllSessions();
    const entries = Object.entries(sessions);
    const n = now();

    let text = `💻 <b>SESSIONS</b>\n\nTotal: <b>${entries.length}</b>\n\n`;
    entries.slice(0, 10).forEach(([t, s]) => {
      const online = (n - (s.lastSeen || 0)) < CONFIG.ONLINE_THRESHOLD_MS;
      text += `${online ? '🟢' : '⚫'} <b>${escapeHtml(s.username || '-')}</b> (${s.role || '-'})\n`;
    });

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

  // ============ MENU: BROADCAST ============
  if (data === 'menu_broadcast'){
    const a = await fbGetAnnounce();

    let text = `📢 <b>BROADCAST / ANNOUNCEMENT</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (a && a.text){
      text += `Current: <i>${escapeHtml(a.text)}</i>\n`;
      text += `Set: ${formatDate(a.time)}\n\n`;
      text += `<code>/broadcast pesan baru</code>\n`;
      text += `<code>/clearannounce</code>`;
    } else {
      text += `Tidak ada announcement aktif.\n\n`;
      text += `<code>/broadcast pesan kamu</code>`;
    }

    return editMsg(chatId, msgId, text, BACK_BTN);
  }

// ============ MENU: STOPALL ============
if (data === 'menu_stopall'){
  return editMsg(chatId, msgId,
    `🛑 <b>STOP ALL — KILL SWITCH</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Fitur ini akan:\n\n` +
    `• 🔧 Matikan maintenance <b>index.html</b>\n` +
    `• 🌐 Matikan maintenance <b>website.html</b>\n` +
    `• 🗑️ Hapus announcement aktif\n` +
    `• 📡 Broadcast reset ke <b>SEMUA</b> client\n` +
    `• 🔄 Force reload di semua user\n\n` +
    `<b>Konfirmasi:</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛑 YA, STOP ALL!', callback_data: 'stopall_confirm' }],
          [{ text: '⬅️ Batal', callback_data: 'menu_back' }]
        ]
      }
    }
  );
}

if (data === 'stopall_confirm'){
  // Eksekusi via handler yang sama
  const fakeMsg = { from: { id: userId }, chat: { id: chatId } };
  try {
    const timestamp = now();
    const updates = {};

    updates['nyx/maintenance/enabled']       = false;
    updates['nyx/maintenance/message']       = '';
    updates['nyx/maintenance/updatedAt']     = timestamp;
    updates['nyx/maintenance/updatedBy']     = 'bot:stopall';

    updates['nyx/maintenanceWeb/enabled']    = false;
    updates['nyx/maintenanceWeb/message']    = '';
    updates['nyx/maintenanceWeb/updatedAt']  = timestamp;
    updates['nyx/maintenanceWeb/updatedBy']  = 'bot:stopall';

    updates['nyx/announce']                  = null;

    updates['nyx/stopall/enabled']           = true;
    updates['nyx/stopall/at']                = timestamp;
    updates['nyx/stopall/by']                = 'bot:' + userId;
    updates['nyx/stopall/scope']             = 'ALL';
    updates['nyx/stopall/ttl']               = timestamp + 30000;
    updates['nyx/stopall/version']           = CONFIG.BOT_VERSION;

    await update(ref(db), updates);

    setTimeout(async () => {
      try {
        await update(ref(db, 'nyx/stopall'), { enabled: false, clearedAt: now() });
      } catch(e){}
    }, 30000);

    return editMsg(chatId, msgId,
      `🛑 <b>STOP ALL EXECUTED</b>\n\n` +
      `Semua maintenance OFF.\n` +
      `Semua client akan reset dalam 1-3 detik.`,
      BACK_BTN
    );
  } catch(e) {
    return editMsg(chatId, msgId, `❌ ${escapeHtml(e.message)}`, BACK_BTN);
  }
}
  // ============ MENU: HELP ============
  if (data === 'menu_help'){
    return editMsg(chatId, msgId,
      `📖 <b>BANTUAN</b>\n\nKirim /help untuk daftar lengkap.`,
      BACK_BTN
    );
  }

  // ============ MENU: BACK ============
  if (data === 'menu_back'){
    return editMsg(chatId, msgId, `⚡ <b>MENU UTAMA</b>`, MAIN_MENU);
  }

  // ============ MENU: CANCEL ============
  if (data === 'menu_cancel'){
    clearState(chatId);
    return editMsg(chatId, msgId, `❌ Dibatalkan.`, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'menu_back' }]] }
    });
  }

  // ============ GENERATE VIA BUTTON ============
  if (data.startsWith('gen_role_')){
    const role = data.replace('gen_role_', '');
    if (!ROLES.includes(role)){
      return editMsg(chatId, msgId, `❌ Role tidak valid.`, BACK_BTN);
    }

    setState(chatId, { action: 'generate', role, step: 'username' });

    return editMsg(chatId, msgId,
      `${roleEmoji(role)} Role: <b>${role}</b>\n\n` +
      `Kirim <b>username</b> yang diinginkan.\n\n` +
      `<i>Ketik /cancel untuk batal.</i>`
    );
  }

  // ============ CREDS PAGINATION ============
  if (data.startsWith('creds_p_')){
    const page = parseInt(data.replace('creds_p_', ''), 10) || 1;
    const { text, buttons } = await buildCredsPage(page);
    return editMsg(chatId, msgId, text, { reply_markup: { inline_keyboard: buttons } });
  }

  if (data.startsWith('creds_f_')){
    const filter = data.replace('creds_f_', '');
    if (filter === 'all'){
      const { text, buttons } = await buildCredsPage(1, null);
      return editMsg(chatId, msgId, text, { reply_markup: { inline_keyboard: buttons } });
    }
    const { text, buttons } = await buildCredsPage(1, filter);
    return editMsg(chatId, msgId, text, { reply_markup: { inline_keyboard: buttons } });
  }

  if (data === 'creds_export'){
    try {
      const users = await fbAllUsers();
      const orders = await fbAllOrders();
      const msgs = await fbAllMessages();
      const dump = {
        exportedAt: now(),
        totalUsers: Object.keys(users).length,
        totalOrders: Object.keys(orders).length,
        totalMessages: Object.keys(msgs).length,
        users,
        orders,
        messages: msgs
      };
      const json = JSON.stringify(dump, null, 2);
      await bot.sendDocument(chatId,
        Buffer.from(json, 'utf-8'),
        { caption: `📦 <b>Backup ${Object.keys(users).length} akun</b>` },
        { filename: `nyx-backup-${now()}.json`, contentType: 'application/json' }
      );
    } catch(e){
      log.error('creds_export:', e.message);
      send(chatId, `❌ Export gagal: ${escapeHtml(e.message)}`);
    }
    return;
  }
});

// ============================================================
// STATE MACHINE — Wizard Generate
// ============================================================
bot.on('message', async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isDev(userId)) return;

  const state = getState(chatId);
  if (!state || state.action !== 'generate') return;

  const text = msg.text.trim();

  if (text === '/cancel'){
    clearState(chatId);
    return send(chatId, `❌ Dibatalkan.`);
  }

  if (state.step === 'username'){
    if (!isValidUsername(text)){
      return send(chatId, `❌ Username tidak valid (3-32 char, hanya huruf/angka/_.-). Coba lagi:`);
    }
    state.username = text;
    state.step = 'password';
    setState(chatId, state);
    return send(chatId, `🔑 Kirim <b>password</b> (min 4 char, tanpa * " ' _):`);
  }

  if (state.step === 'password'){
    if (!isValidPassword(text)){
      return send(chatId, `❌ Password 4-64 char, tidak boleh * " ' _. Coba lagi:`);
    }
    state.password = text;

    if (state.role === ROLE_MEMBER){
      state.step = 'expired';
      setState(chatId, state);
      return send(chatId, `⏳ Berapa <b>hari</b> expired? (1-10)\n\n<i>Ketik angka saja.</i>`);
    }

    clearState(chatId);
    await createAccountWizard(chatId, state);
    return;
  }

  if (state.step === 'expired'){
    const days = parseInt(text, 10);
    if (isNaN(days) || days < 1 || days > 10){
      return send(chatId, `❌ Harus angka 1-10. Coba lagi:`);
    }
    state.expiredDays = days;
    clearState(chatId);
    await createAccountWizard(chatId, state);
    return;
  }
});

async function createAccountWizard(chatId, state){
  const loading = await send(chatId, `⏳ Membuat akun...`);

  try {
    const u = await fbCreateUser({
      username: state.username,
      password: state.password,
      role: state.role,
      expiredDays: state.expiredDays
    });

    let text = `✅ <b>AKUN DIBUAT</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `👤 Username: <code>${escapeHtml(u.username)}</code>\n`;
    text += `🔑 Password: <code>${escapeHtml(state.password)}</code>\n`;
    text += `🎭 Role: <b>${roleEmoji(u.role)} ${escapeHtml(u.role)}</b>\n`;

    if (u.expiry > 0){
      const days = Math.ceil((u.expiry - now()) / CONFIG.DAY_MS);
      text += `⏳ Expired: <b>${days} hari</b>\n`;
      text += `📅 Sampai: ${formatDate(u.expiry)}\n`;
    } else {
      text += `♾️ <b>PERMANENT</b>\n`;
    }

    editMsg(chatId, loading.message_id, text, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'menu_back' }]] }
    });
  } catch(e){
    editMsg(chatId, loading.message_id, `❌ <b>GAGAL:</b> ${escapeHtml(e.message)}`);
  }
}

// ---------- END PART 2 ----------
// ============================================================
// UNKNOWN COMMAND HANDLER
// ============================================================
bot.on('message', (msg) => {
  if (!msg.text) return;
  if (!msg.text.startsWith('/')) return;

  // Whitelist command yang dikenali
  const known = /^\/(start|help|menu|id|whoami|generate|users|creds|export|user|delete|ban|unban|setrole|setexp|setbal|setpass|orders|pending|order|approve|reject|msgs|convo|reply|maintenance|maintweb|broadcast|clearannounce|stats|sessions|clearsessions|settings|setapp|setwa|settg|settt|cancel)/;

  if (!known.test(msg.text)){
    if (isDev(msg.from.id)){
      send(msg.chat.id, `❓ Command tidak dikenal. Ketik /help`);
    }
  }
});

// ============================================================
// POLLING ERROR HANDLER
// ============================================================
bot.on('polling_error', (err) => {
  log.error('Polling error:', err.code || err.message);

  // Auto-retry info
  if (err.code === 'EFATAL'){
    log.warn('Fatal polling error — bot akan restart otomatis dalam 5s');
  } else if (err.code === 'ETELEGRAM'){
    log.warn('Telegram API error — cek BOT_TOKEN / koneksi');
  }
});

bot.on('webhook_error', (err) => {
  log.error('Webhook error:', err.message);
});

// ============================================================
// BOT ERROR HANDLER
// ============================================================
bot.on('error', (err) => {
  log.error('Bot error:', err.message);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
let _shutdownInProgress = false;

async function shutdown(signal){
  if (_shutdownInProgress) return;
  _shutdownInProgress = true;

  log.warn(`Received ${signal}, shutting down gracefully...`);

  try {
    await bot.stopPolling({ cancel: true });
    log.ok('Bot polling stopped.');

    // Notify developers
    for (const id of CONFIG.DEV_IDS){
      try {
        await send(id, `🔴 <b>Bot shutting down</b>\n\nSignal: <code>${signal}</code>`);
      } catch(e){}
    }
  } catch(e){
    log.error('Shutdown error:', e.message);
  }

  setTimeout(() => process.exit(0), 500);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGHUP',  () => shutdown('SIGHUP'));

// ============================================================
// UNCAUGHT EXCEPTION / UNHANDLED REJECTION
// ============================================================
process.on('uncaughtException', (err) => {
  log.error('UNCAUGHT EXCEPTION:', err.stack || err.message);

  // Notify dev
  CONFIG.DEV_IDS.forEach(id => {
    try {
      bot.sendMessage(id,
        `❌ <b>UNCAUGHT EXCEPTION</b>\n\n` +
        `<code>${escapeHtml(err.message)}</code>\n\n` +
        `<i>Bot tetap berjalan.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch(e){}
  });
});

process.on('unhandledRejection', (err) => {
  log.error('UNHANDLED REJECTION:', err && err.stack ? err.stack : err);

  CONFIG.DEV_IDS.forEach(id => {
    try {
      bot.sendMessage(id,
        `⚠️ <b>UNHANDLED PROMISE REJECTION</b>\n\n` +
        `<code>${escapeHtml(err && err.message ? err.message : String(err))}</code>\n\n` +
        `<i>Bot tetap berjalan.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch(e){}
  });
});

// ============================================================
// REGISTER BOT COMMANDS (Telegram menu)
// ============================================================
(async () => {
  try {
    await bot.setMyCommands([
      { command: 'start',          description: '⚡ Mulai bot' },
      { command: 'menu',           description: '🏠 Menu utama' },
      { command: 'help',           description: '❓ Bantuan lengkap' },

      { command: 'generate',       description: '👤 Generate akun baru' },
      { command: 'users',          description: '📋 Daftar semua user' },
      { command: 'creds',          description: '🔐 Semua username + password' },
      { command: 'export',         description: '📦 Export semua data JSON' },
      { command: 'user',           description: '👤 Detail user' },
      { command: 'delete',         description: '🗑 Hapus user' },
      { command: 'ban',            description: '🚫 Ban user' },
      { command: 'unban',          description: '✅ Unban user' },
      { command: 'setrole',        description: '🎭 Set role user' },
      { command: 'setexp',         description: '⏳ Set expiry user' },
      { command: 'setbal',         description: '💰 Set balance user' },
      { command: 'setpass',        description: '🔑 Reset password user' },

      { command: 'orders',         description: '📦 List orders' },
      { command: 'pending',        description: '⏳ Order pending' },
      { command: 'approve',        description: '✅ Approve order' },
      { command: 'reject',         description: '❌ Reject order' },

      { command: 'msgs',           description: '📩 CS messages unread' },
      { command: 'convo',          description: '💬 Lihat history chat' },
      { command: 'reply',          description: '↩️ Reply CS' },

      { command: 'maintenance',    description: '🔧 Maintenance (index.html)' },
      { command: 'maintweb',       description: '🌐 Maintenance (website.html)' },

      { command: 'broadcast',      description: '📢 Broadcast pesan' },
      { command: 'stopall',        description: '🛑 STOP ALL (force reset)' },
      { command: 'clearannounce',  description: '🗑 Hapus announcement' },

      { command: 'stats',          description: '📊 Statistik lengkap' },
      { command: 'sessions',       description: '💻 Daftar session' },
      { command: 'clearsessions',  description: '🧹 Hapus session lama' },

      { command: 'settings',       description: '⚙️ Lihat settings' },
      { command: 'setapp',         description: '📝 Set nama aplikasi' },
      { command: 'setwa',          description: '📱 Set WhatsApp link' },
      { command: 'settg',          description: '💬 Set Telegram link' },
      { command: 'settt',          description: '🎵 Set TikTok link' },

      { command: 'whoami',         description: '🆔 Info akun kamu' },
      { command: 'id',             description: '🆔 Lihat Telegram ID' },
      { command: 'cancel',         description: '❌ Batalkan wizard' }
    ]);

    log.ok('Bot commands registered.');

    // Init realtime listeners
    initRealtimeListeners();

  } catch(e){
    log.warn('Failed to set commands:', e.message);
  }
})();

// ============================================================
// HEARTBEAT (SETIAP 5 MENIT)
// ============================================================
setInterval(() => {
  const uptime = Math.floor(process.uptime());
  const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const uptimeStr = uptime >= 3600
    ? Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm'
    : Math.floor(uptime / 60) + 'm ' + (uptime % 60) + 's';

  log.debug(`Heartbeat: uptime ${uptimeStr}, memory ${mem}MB`);
}, 5 * 60 * 1000);

// ============================================================
// FIREBASE CONNECTION MONITOR
// ============================================================
let _fbConnected = true;
let _fbCheckInterval = null;

function startFirebaseMonitor(){
  _fbCheckInterval = setInterval(async () => {
    try {
      const snap = await get(ref(db, 'nyx/config/safemode'));
      if (!_fbConnected){
        _fbConnected = true;
        log.ok('Firebase reconnected');

        CONFIG.DEV_IDS.forEach(id => {
          try {
            send(id, `🟢 <b>Firebase reconnected</b>\n\nBot kembali online.`);
          } catch(e){}
        });
      }
    } catch(e){
      if (_fbConnected){
        _fbConnected = false;
        log.warn('Firebase connection lost:', e.message);

        CONFIG.DEV_IDS.forEach(id => {
          try {
            send(id, `🔴 <b>Firebase offline</b>\n\n<code>${escapeHtml(e.message)}</code>`);
          } catch(err){}
        });
      }
    }
  }, 60 * 1000); // check setiap 60 detik
}

// Start monitor setelah 10 detik
setTimeout(startFirebaseMonitor, 10000);

// ============================================================
// SESSION CLEANUP (SETIAP HARI)
// ============================================================
setInterval(async () => {
  try {
    const count = await fbClearOldSessions(CONFIG.SESSION_RETENTION_DAYS);
    if (count > 0){
      log.info(`Auto-cleanup: ${count} session lama dihapus`);
    }
  } catch(e){
    log.warn('Auto session cleanup error:', e.message);
  }
}, CONFIG.DAY_MS); // setiap 24 jam

// ============================================================
// INFO BANNER SAAT START
// ============================================================
console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║      ███    ██ ██    ██ ██   ██    ██    ██  ██████       ║
║      ████   ██  ██  ██   ██ ██    ██    ██ ██    ██      ║
║      ██ ██  ██   ████     ███      ██  ██  ██    ██      ║
║      ██  ██ ██    ██       ██       ████    ██    ██      ║
║      ██   ████    ██       ██        ██      ██████       ║
║                                                          ║
║              NYX VOID BOT v${CONFIG.BOT_VERSION} — FINAL ABSOLUTE          ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  ✅ Bot started                                          ║
║  ✅ Firebase connected                                   ║
║  ✅ ${String(CONFIG.DEV_IDS.length).padEnd(2)} developer(s) registered                              ║
║  ✅ Realtime listeners aktif                             ║
║  ✅ Anti-duplicate notification aktif                    ║
║  ✅ Auto session cleanup aktif                           ║
║  ✅ Firebase connection monitor aktif                    ║
║                                                          ║
║  📡 Listening for commands...                            ║
║  🔧 Maintenance: /maintenance (global) /maintweb (web)   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

// ============================================================
// STARTUP INFO UNTUK DEVELOPER
// ============================================================
setTimeout(async () => {
  for (const id of CONFIG.DEV_IDS){
    try {
      await send(id,
        `⚡ <b>NYX VOID BOT v${CONFIG.BOT_VERSION}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🟢 <b>Bot online!</b>\n\n` +
        `<b>Fitur baru:</b>\n` +
        `• Maintenance terpisah:\n` +
        `  🔧 <code>/maintenance</code> → index.html\n` +
        `  🌐 <code>/maintweb</code> → website.html\n` +
        `• 🔐 <code>/creds</code> — Semua credentials\n` +
        `• 📤 <code>/export</code> — Backup JSON\n\n` +
        `<i>Ketik /start untuk membuka menu.</i>`
      );
    } catch(e){
      log.warn('Failed to send startup notif:', e.message);
    }
  }
}, 3000);

// ============================================================
// EXPORT (untuk testing)
// ============================================================
module.exports = {
  bot,
  db,
  CONFIG,
  fbGetUser,
  fbAllUsers,
  fbCreateUser,
  fbApproveOrder,
  fbSendDevReply
};

// ============================================================
// END OF FILE
// ============================================================
