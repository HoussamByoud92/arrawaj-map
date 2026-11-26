const { createHmac, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const store = require('./_github');
const secure = require('./_secure');

const scrypt = promisify(scryptCallback);
const USER_PATH = 'data/admin-users.json';
const COOKIE = 'arrawaj_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
const ALL_PERMISSIONS = { stories: true, content: true, users: true, settings: true };

function sessionSecret() {
  if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) throw new Error('Set ADMIN_SESSION_SECRET to a random value of at least 32 characters.');
  return process.env.ADMIN_SESSION_SECRET;
}

async function loadUsers() {
  const record = await store.readJson(USER_PATH, null);
  return { value: secure.open(record.value, { users: [] }), sha: record.sha };
}

async function writeUsers(users, sha, message) {
  return store.writeJson(USER_PATH, secure.seal({ users }), sha, message);
}

async function makePasswordHash(password, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, passwordHash: hash.toString('hex') };
}

async function checkPassword(password, user) {
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = await scrypt(password, user.salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createSession(userId) {
  const encodedId = Buffer.from(userId).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = createHmac('sha256', sessionSecret()).update(`${encodedId}.${expires}`).digest('base64url');
  return { value: `${encodedId}.${expires}.${signature}`, expires };
}

function sessionUserId(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const raw = cookie?.slice(COOKIE.length + 1) || '';
  const [encodedId, expiresText, signature] = raw.split('.');
  const expires = Number(expiresText);
  if (!encodedId || !signature || !Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac('sha256', sessionSecret()).update(`${encodedId}.${expires}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return Buffer.from(encodedId, 'base64url').toString('utf8'); } catch { return null; }
}

async function currentUser(req) {
  const id = sessionUserId(req);
  if (!id) return null;
  const { value } = await loadUsers();
  return (value.users || []).find((user) => user.id === id && user.active !== false) || null;
}

function hasPermission(user, name) {
  return !!(user && (user.id === 'owner' || (user.permissions && user.permissions[name] === true)));
}

module.exports = { ALL_PERMISSIONS, COOKIE, SESSION_SECONDS, USER_PATH, checkPassword, createSession, currentUser, hasPermission, loadUsers, makePasswordHash, sessionUserId, writeUsers };
