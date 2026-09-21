let members = [];

function requireUserAdmin() {
  if (!currentMember()) {
    location.replace('login.html?next=users.html');
    return false;
  }
  if (!isUserAdmin()) {
    location.replace('cake.html');
    return false;
  }
  return true;
}

async function updateUser(id, name, permissions) {
  await refreshIdentity();
  if (!requireUserAdmin()) throw Error('관리자만 변경할 수 있습니다.');
  const updated = await api(`/api/users/${id}`, { method: 'PUT', body: { name, permissions } });
  members = members.map(user => user.id === id ? updated : user);
  return updated;
}

async function deleteUser(id) {
  await refreshIdentity();
  if (!requireUserAdmin()) throw Error('관리자만 삭제할 수 있습니다.');
  await api(`/api/users/${id}`, { method: 'DELETE' });
  members = members.filter(user => user.id !== id);
}

function renderUsers() {
  $('userList').replaceChildren();
  for (const user of [...members].sort((a, b) => a.id.localeCompare(b.id))) {
    const card = document.createElement('details');
    card.className = 'user-card';
    card.dataset.search = `${user.id} ${user.name}`.toLocaleLowerCase();
    const summary = document.createElement('summary');
    summary.className = 'user-summary';
    const summaryName = document.createElement('span');
    const updateSummary = value => { summaryName.textContent = `${user.id} · ${value}${user.isAdmin ? ' · 관리자' : ''}`; };
    updateSummary(user.name);
    const hint = document.createElement('span');
    hint.className = 'user-summary-hint';
    hint.textContent = '펼치기';
    card.addEventListener('toggle', () => { hint.textContent = card.open ? '접기' : '펼치기'; });
    summary.append(summaryName, hint);
    const form = document.createElement('form');
    form.className = 'user-card-form';
    const label = document.createElement('label');
    label.textContent = '이름';
    const name = document.createElement('input');
    name.value = user.name;
    name.required = true;
    name.maxLength = 30;
    label.append(name);
    const table = document.createElement('table');
    table.className = 'permissions-table';
    table.innerHTML = '<caption>게시판별 권한</caption><thead><tr><th scope="col" rowspan="2">게시판</th><th scope="col" rowspan="2">읽기</th><th scope="col" rowspan="2">쓰기</th><th scope="colgroup" colspan="2">수정</th><th scope="colgroup" colspan="2">삭제</th></tr><tr><th scope="col">내 글</th><th scope="col">다른 사람 글도</th><th scope="col">내 글</th><th scope="col">다른 사람 글도</th></tr></thead>';
    const tbody = document.createElement('tbody');
    const inputs = {};
    const values = permissionsFor(user);
    for (const [key, [title]] of Object.entries(boards)) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = title;
      row.append(th);
      inputs[key] = {};
      for (const [action, text] of Object.entries({ read: '읽기', write: '쓰기', editOwn: '내 글 수정', editOthers: '다른 사람 글도 수정', deleteOwn: '내 글 삭제', deleteOthers: '다른 사람 글도 삭제' })) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = values[key][action];
        input.setAttribute('aria-label', `${user.id} ${title} ${text}`);
        inputs[key][action] = input;
        td.append(input);
        row.append(td);
      }
      for (const action of ['edit', 'delete']) {
        const own = inputs[key][action + 'Own'];
        const others = inputs[key][action + 'Others'];
        const sync = () => {
          if (others.checked) own.checked = true;
          own.disabled = others.checked;
        };
        others.onchange = sync;
        sync();
      }
      tbody.append(row);
    }
    table.append(tbody);
    const tableScroll = document.createElement('div');
    tableScroll.className = 'permissions-scroll';
    tableScroll.tabIndex = 0;
    tableScroll.setAttribute('role', 'region');
    tableScroll.setAttribute('aria-label', `${user.id} 게시판 권한 설정`);
    tableScroll.append(table);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'quiet'; reset.textContent = '기본 권한으로';
    reset.onclick = () => {
      const defaults = defaultPermissions();
      for (const key of Object.keys(inputs)) for (const action of Object.keys(inputs[key])) inputs[key][action].checked = defaults[key][action];
      for (const key of Object.keys(inputs)) for (const action of ['edit', 'delete']) inputs[key][action + 'Others'].onchange();
      status.textContent = '기본 권한을 적용하려면 변경 저장을 눌러 주세요.';
    };
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'primary'; save.textContent = '변경 저장';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'danger'; remove.textContent = '회원 삭제';
    remove.disabled = !!user.isAdmin;
    if (remove.disabled) remove.title = 'ADMIN_ID에 지정된 관리자 계정은 삭제할 수 없습니다.';
    const status = document.createElement('p');
    status.className = 'muted'; status.setAttribute('role', 'status');
    remove.onclick = async () => {
      if (!confirm(`${user.name} (${user.id}) 회원을 삭제할까요?\n작성한 글은 유지되며 작성자는 '삭제됨'으로 표시됩니다. 임시저장은 삭제됩니다.`)) return;
      remove.disabled = true; save.disabled = true; reset.disabled = true;
      status.textContent = '삭제 중…';
      try {
        await deleteUser(user.id);
        card.remove();
        filterUsers();
        toast('회원을 삭제했습니다.');
      } catch (error) {
        status.textContent = error.message || '회원을 삭제하지 못했습니다.';
        remove.disabled = !!user.isAdmin; save.disabled = false; reset.disabled = false;
      }
    };
    actions.append(reset, remove, save);
    form.append(label, tableScroll, actions, status);
    form.onsubmit = async event => {
      event.preventDefault(); save.disabled = true; remove.disabled = true; status.textContent = '저장 중…';
      const permissions = Object.fromEntries(Object.entries(inputs).map(([key, controls]) => [key, Object.fromEntries(Object.entries(controls).map(([action, input]) => [action, input.checked]))]));
      try {
        const updated = await updateUser(user.id, name.value, permissions);
        name.value = updated.name;
        user.name = updated.name;
        user.isAdmin = updated.isAdmin;
        card.dataset.search = `${user.id} ${updated.name}`.toLocaleLowerCase();
        updateSummary(updated.name);
        status.textContent = '이름과 권한을 저장했습니다.';
      } catch (error) {
        status.textContent = error.message || '저장하지 못했습니다.';
      } finally { save.disabled = false; remove.disabled = !!user.isAdmin; }
    };
    card.append(summary, form);
    $('userList').append(card);
  }
  filterUsers();
}

function filterUsers() {
  const query = $('userSearch').value.trim().toLocaleLowerCase();
  let count = 0;
  for (const card of $('userList').children) {
    card.hidden = !card.dataset.search.includes(query);
    if (!card.hidden) count++;
  }
  $('userCount').textContent = `${count}명의 사용자`;
}

(async () => {
  try {
    await refreshIdentity();
    if (!requireUserAdmin()) return;
    members = await api('/api/users');
    $('usersPanel').hidden = false;
    $('userSearch').oninput = filterUsers;
    renderUsers();
  } catch {
    toast('사용자 정보를 불러오지 못했습니다. 다시 열어 주세요.');
  }
})();

window.addEventListener('pageshow', async event => {
  if (event.persisted) {
    try { await refreshIdentity(); requireUserAdmin(); }
    catch { location.replace('login.html?next=users.html'); }
  }
});
