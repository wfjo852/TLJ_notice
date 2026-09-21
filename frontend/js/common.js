'use strict';

const $ = id => document.getElementById(id);
const guestMode = document.body.dataset.mode === 'guest';
const boards = {
  cake: ['케이크 생산', '내일의 생산 목록을 확인하고 준비해 주세요.'],
  notice: ['공지사항', '매장에 필요한 소식과 안내를 함께 나눠요.'],
  request: ['필요 물품 요청', '필요한 물품을 누구나 편하게 요청하세요.'],
};

let board = 'cake', page = 1, member = null, memberRecord = null, posts = [], editing = null, viewing = null;
let media = [], draftQueue = Promise.resolve(), editorOpen = false, mediaBusy = false;
let imageIndex = 0, originalImage = null, drawing = false;

const date = d => new Date(d).toLocaleString('ko-KR');
const shortDate = d => new Date(d).toLocaleDateString('ko-KR');

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').hidden = true, 4500);
}

async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers);
  if (guestMode) headers['X-TLJ-Guest'] = '1';
  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { ...options, headers, body, credentials: 'same-origin' });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || '요청을 처리하지 못했습니다.');
  return data;
}

function safeRich(html) {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI']);
  function clean(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    const out = document.createDocumentFragment();
    if (node.nodeType !== 1) return out;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return out;
    const target = allowed.has(node.tagName) ? document.createElement(node.tagName) : out;
    for (const child of node.childNodes) target.append(clean(child));
    return target;
  }
  const holder = document.createElement('div');
  for (const node of source.body.childNodes) holder.append(clean(node));
  return holder.innerHTML;
}

function textOf(html) {
  const element = document.createElement('div');
  element.innerHTML = safeRich(html);
  return element.textContent;
}

function tomorrowTitle() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `[${String(d.getFullYear()).slice(-2)}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}] 생산목록`;
}

function currentMember() {
  return memberRecord;
}

function defaultPermissions() {
  return Object.fromEntries(Object.keys(boards).map(key => [key, {
    read: true, write: key === 'request',
    editOwn: key === 'request', editOthers: key === 'request',
    deleteOwn: key === 'request', deleteOthers: key === 'request',
  }]));
}

function permissionsFor(user) {
  const defaults = defaultPermissions();
  for (const key of Object.keys(defaults)) {
    for (const action of Object.keys(defaults[key])) {
      const stored = user?.permissions?.[key] || {};
      let value = stored[action];
      if (!(action in stored) && /^(edit|delete)/.test(action)) {
        value = stored[action.startsWith('edit') ? 'edit' : 'delete'];
      }
      if (typeof value === 'boolean') defaults[key][action] = value;
    }
    for (const action of ['edit', 'delete']) {
      if (defaults[key][action + 'Others']) defaults[key][action + 'Own'] = true;
    }
  }
  return defaults;
}

function hasPermission(key, action) {
  return !!currentMember() && permissionsFor(currentMember())[key]?.[action] === true;
}

function isUserAdmin() {
  return !guestMode && !!currentMember()?.isAdmin;
}

function canRead(key = board) {
  return guestMode || hasPermission(key, 'read');
}

function canWrite() {
  return guestMode ? board === 'request' : hasPermission(board, 'write');
}

function canEdit(post) {
  return !!post.canEdit;
}

function canDelete(post) {
  return !!post.canDelete;
}

function postUrl(id, guest = guestMode) {
  return `${guest ? 'guest-' : ''}post.html?id=${encodeURIComponent(id)}`;
}
function editorUrl(boardName, id = null) {
  return `${guestMode ? 'guest-' : ''}edit.html?board=${encodeURIComponent(boardName)}${id ? '&id=' + encodeURIComponent(id) : ''}`;
}
function listUrl(boardName = board) {
  return `${guestMode ? 'guest-' : ''}${boards[boardName] ? boardName : 'cake'}.html`;
}
function loginForCurrentPage() {
  location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
}

async function refreshIdentity() {
  if (guestMode) { member = null; memberRecord = null; return; }
  const result = await api('/api/me');
  memberRecord = result.member || null;
  member = memberRecord?.id || null;
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  location.replace('login.html');
}
function mediaElement(item) {
  const element = document.createElement(item.kind === 'image' ? 'img' : 'video');
  element.src = mediaUrl(item.url);
  if (item.kind === 'video') { element.controls = true; element.preload = 'metadata'; }
  else element.alt = item.name;
  return element;
}

function mediaUrl(url) {
  if (!guestMode) return url;
  const result = new URL(url, location.href);
  result.searchParams.set('guest', '1');
  return result.href;
}
