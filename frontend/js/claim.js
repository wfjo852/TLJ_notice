'use strict';

let claims = [];

function formatPhone(value) {
  const d = String(value).replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) {
    const r = d.slice(0, 10);
    if (r.length <= 2) return r;
    if (r.length <= 5) return `02-${r.slice(2)}`;
    if (r.length <= 9) return `02-${r.slice(2, 5)}-${r.slice(5)}`;
    return `02-${r.slice(2, 6)}-${r.slice(6)}`;
  }
  if (/^1[5-9]/.test(d) && d.length <= 8) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function claimUrl(id) {
  return `${guestMode ? 'guest-' : ''}claim-detail.html?id=${encodeURIComponent(id)}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusBadge(resolved) {
  return el('span', `claim-status ${resolved ? 'done' : 'open'}`, resolved ? '처리 완료' : '미처리');
}

function todayValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wirePhoneInput(input) {
  input.addEventListener('input', () => {
    const digitsBefore = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;
    input.value = formatPhone(input.value);
    let pos = 0, seen = 0;
    while (pos < input.value.length && seen < digitsBefore) { if (/\d/.test(input.value[pos])) seen++; pos++; }
    input.setSelectionRange(pos, pos);
  });
}

// ---- 목록 ----

function renderClaims() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const queryDigits = query.replace(/\D/g, '');
  const filtered = claims.filter(c => !query ||
    (queryDigits && c.phone.includes(queryDigits)) ||
    (c.item + ' ' + c.content).toLocaleLowerCase().includes(query));
  $('total').textContent = filtered.length;
  $('posts').replaceChildren();
  if (!filtered.length) {
    const empty = el('div', 'empty');
    empty.append(el('div', 'empty-icon', '☎'),
      el('h3', '', query ? '검색 결과가 없습니다.' : '아직 등록된 클레임이 없습니다.'),
      el('p', '', query ? '다른 연락처나 물품명을 입력해 주세요.' : '클레임 등록 버튼으로 첫 클레임을 기록하세요.'));
    $('posts').append(empty);
    return;
  }
  const head = el('div', 'row table-head claim-row');
  for (const label of ['연락처', '마지막 클레임', '횟수', '상태', '등록일']) head.append(el('span', '', label));
  $('posts').append(head);
  for (const c of filtered) {
    const row = el('a', 'row claim-row');
    row.href = claimUrl(c.id);
    if (c.id === renderClaims.highlight) row.classList.add('highlight');
    const summary = el('span', 'row-title');
    summary.append(el('b', '', c.item), el('small', '', c.content));
    const count = el('span', 'claim-count', `${c.count}회`);
    if (c.count > 1) count.classList.add('repeat');
    const when = el('time', '', shortDate(c.created));
    when.dateTime = c.created;
    row.append(el('span', 'claim-phone', formatPhone(c.phone)), summary, count, statusBadge(c.resolved), when);
    $('posts').append(row);
  }
}

async function loadClaims() {
  claims = await api('/api/claims');
  renderClaims();
}

function openClaimForm() {
  $('claimForm').reset();
  $('claimDate').value = todayValue();
  $('claimDate').max = todayValue();
  $('claimError').textContent = '';
  $('claimDialog').showModal();
  $('claimPhone').focus();
}

async function submitClaim(event) {
  event.preventDefault();
  const phone = $('claimPhone').value.replace(/\D/g, '');
  if (phone.length < 8) { $('claimError').textContent = '연락처를 정확히 입력해 주세요.'; $('claimPhone').focus(); return; }
  const button = $('claimSubmit');
  button.disabled = true;
  try {
    const created = await api('/api/claims', { method: 'POST', body: {
      phone, purchaseDate: $('claimDate').value, item: $('claimItem').value, content: $('claimContent').value,
      resolved: $('claimResolved').checked, comment: $('claimComment').value, guestName: $('claimGuestName')?.value || '',
    } });
    $('claimDialog').close();
    $('search').value = '';
    renderClaims.highlight = created.id;
    await loadClaims();
    const latest = claims.find(c => c.id === created.id);
    toast(`클레임이 등록되었습니다. 이 연락처의 누적 클레임은 ${latest?.count || 1}회입니다.`);
  } catch (error) {
    $('claimError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function initList() {
  await refreshIdentity();
  if (!guestMode && !currentMember()) { loginForCurrentPage(); return; }
  $('appShell').hidden = false;
  if ($('usersLink')) $('usersLink').hidden = !isUserAdmin();
  $('account').textContent = guestMode ? '비회원 모드 · 회원 로그인' : `${currentMember().name} · 로그아웃`;
  $('account').onclick = () => { if (guestMode) { location.href = 'login.html'; return; } logout(); };
  $('search').oninput = renderClaims;
  $('newClaim').onclick = openClaimForm;
  $('claimForm').onsubmit = submitClaim;
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  wirePhoneInput($('claimPhone'));
  await loadClaims();
}

// ---- 상세 ----

let claim = null;

function infoRow(label, value) {
  const row = el('div', 'claim-info-row');
  row.append(el('dt', '', label), el('dd', '', value));
  return row;
}

function renderComments() {
  $('commentList').replaceChildren();
  $('commentEmpty').hidden = claim.comments.length > 0;
  $('commentCount').textContent = claim.comments.length;
  for (const comment of claim.comments) {
    const item = el('li', 'claim-comment');
    const head = el('div', 'comment-head');
    const actions = el('div', 'comment-actions');
    const edit = el('button', 'quiet', '수정');
    const remove = el('button', 'quiet', '삭제');
    edit.type = remove.type = 'button';
    edit.onclick = () => editComment(item, comment);
    remove.onclick = () => deleteComment(comment);
    actions.append(edit, remove);
    head.append(el('div', 'meta-line', `${comment.author} · ${date(comment.created)}`), actions);
    item.append(head, el('p', '', comment.body));
    $('commentList').append(item);
  }
}

function commentUrl(comment) {
  return `/api/claims/${encodeURIComponent(claim.id)}/comments/${encodeURIComponent(comment.id)}`;
}

function editComment(item, comment) {
  const form = el('form', 'comment-edit');
  const input = el('textarea');
  input.rows = 3;
  input.maxLength = 5000;
  input.value = comment.body;
  input.setAttribute('aria-label', '처리 방법 수정');
  const actions = el('div', 'form-actions');
  const cancel = el('button', 'quiet', '취소');
  cancel.type = 'button';
  cancel.onclick = renderComments;
  const save = el('button', 'primary', '저장');
  actions.append(cancel, save);
  form.append(input, actions);
  form.onsubmit = async event => {
    event.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    save.disabled = true;
    try {
      claim.comments = await api(commentUrl(comment), { method: 'PUT', body: { body: input.value } });
      renderComments();
      toast('처리 방법을 수정했습니다.');
    } catch (error) {
      toast(error.message);
      save.disabled = false;
    }
  };
  item.querySelector('p').replaceWith(form);
  item.querySelector('.comment-actions').hidden = true;
  input.focus();
}

async function deleteComment(comment) {
  if (!confirm('이 처리 방법 댓글을 삭제할까요?')) return;
  try {
    claim.comments = await api(commentUrl(comment), { method: 'DELETE' });
    renderComments();
    toast('처리 방법을 삭제했습니다.');
  } catch (error) {
    toast(error.message);
  }
}

function renderHistory() {
  $('historyList').replaceChildren();
  $('historyEmpty').hidden = claim.history.length > 0;
  $('historyCount').textContent = claim.history.length;
  for (const past of claim.history) {
    const row = el('a', 'claim-history-row');
    row.href = claimUrl(past.id);
    const text = el('span', 'row-title');
    text.append(el('b', '', past.item), el('small', '', past.content));
    row.append(el('time', '', `구매 ${past.purchaseDate}`), text, statusBadge(past.resolved));
    $('historyList').append(row);
  }
}

function renderDetail() {
  document.title = `클레임 ${formatPhone(claim.phone)} · TLJ`;
  $('claimPhoneTitle').textContent = formatPhone(claim.phone);
  $('claimSummary').textContent = `이 연락처의 클레임 총 ${claim.history.length + 1}회`;
  $('claimInfo').replaceChildren(
    infoRow('구매 날짜', claim.purchaseDate),
    infoRow('구매 물품', claim.item),
    infoRow('등록', `${claim.author} · ${date(claim.created)}`),
  );
  $('claimBody').textContent = claim.content;
  $('resolvedToggle').checked = claim.resolved;
  $('resolvedLabel').replaceChildren(statusBadge(claim.resolved));
  $('deleteClaim').hidden = !claim.canDelete;
  renderComments();
  renderHistory();
}

async function initDetail() {
  await refreshIdentity();
  if (!guestMode && !currentMember()) { loginForCurrentPage(); return; }
  $('backToList').href = guestMode ? 'guest-claim.html' : 'claim.html';
  const id = new URLSearchParams(location.search).get('id');
  try {
    claim = await api(`/api/claims/${encodeURIComponent(id || '')}`);
  } catch (error) {
    $('pageStatus').textContent = error.message;
    return;
  }
  $('pageStatus').hidden = true;
  $('claimPage').hidden = false;
  renderDetail();
  $('resolvedToggle').onchange = async () => {
    const resolved = $('resolvedToggle').checked;
    try {
      await api(`/api/claims/${encodeURIComponent(claim.id)}`, { method: 'PATCH', body: { resolved } });
      claim.resolved = resolved;
      $('resolvedLabel').replaceChildren(statusBadge(resolved));
      toast(resolved ? '처리 완료로 변경했습니다.' : '미처리로 변경했습니다.');
    } catch (error) {
      $('resolvedToggle').checked = claim.resolved;
      toast(error.message);
    }
  };
  $('commentForm').onsubmit = async event => {
    event.preventDefault();
    const body = $('commentBody').value.trim();
    if (!body) { $('commentBody').focus(); return; }
    $('commentSubmit').disabled = true;
    try {
      claim.comments = await api(`/api/claims/${encodeURIComponent(claim.id)}/comments`, { method: 'POST',
        body: { body, guestName: $('commentGuestName')?.value || '' } });
      $('commentBody').value = '';
      renderComments();
    } catch (error) {
      toast(error.message);
    } finally {
      $('commentSubmit').disabled = false;
    }
  };
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  wirePhoneInput($('claimPhone'));
  $('editClaim').onclick = () => {
    $('claimPhone').value = formatPhone(claim.phone);
    $('claimDate').value = claim.purchaseDate;
    $('claimDate').max = todayValue();
    $('claimItem').value = claim.item;
    $('claimContent').value = claim.content;
    $('claimError').textContent = '';
    $('editDialog').showModal();
  };
  $('editForm').onsubmit = async event => {
    event.preventDefault();
    const phone = $('claimPhone').value.replace(/\D/g, '');
    if (phone.length < 8) { $('claimError').textContent = '연락처를 정확히 입력해 주세요.'; $('claimPhone').focus(); return; }
    $('claimSubmit').disabled = true;
    try {
      await api(`/api/claims/${encodeURIComponent(claim.id)}`, { method: 'PUT', body: {
        phone, purchaseDate: $('claimDate').value, item: $('claimItem').value, content: $('claimContent').value,
      } });
      claim = await api(`/api/claims/${encodeURIComponent(claim.id)}`);
      renderDetail();
      $('editDialog').close();
      toast('클레임을 수정했습니다.');
    } catch (error) {
      $('claimError').textContent = error.message;
    } finally {
      $('claimSubmit').disabled = false;
    }
  };
  $('deleteClaim').onclick = async () => {
    if (!confirm('이 클레임을 삭제할까요? 처리 방법 댓글도 함께 삭제됩니다.')) return;
    try {
      await api(`/api/claims/${encodeURIComponent(claim.id)}`, { method: 'DELETE' });
      location.replace($('backToList').href);
    } catch (error) {
      toast(error.message);
    }
  };
}

(async () => {
  try {
    await (document.body.dataset.page === 'claim-detail' ? initDetail() : initList());
  } catch {
    toast('서버에 연결할 수 없습니다. 다시 열어 주세요.');
  }
})();
