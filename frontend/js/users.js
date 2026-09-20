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
  if (!requireUserAdmin()) throw Error('0026 사용자만 변경할 수 있습니다.');
  name = name.trim();
  if (!name || name.length > 30) throw Error('이름을 1~30자로 입력해 주세요.');
  const normalized = {};
  for (const key of Object.keys(boards)) {
    normalized[key] = {};
    for (const action of ['read', 'write', 'edit', 'delete']) {
      if (typeof permissions?.[key]?.[action] !== 'boolean') throw Error('권한 설정을 확인해 주세요.');
      normalized[key][action] = permissions[key][action];
    }
  }
  const existing = await get('members', id);
  if (!existing) throw Error('사용자를 찾을 수 없습니다.');
  const updated = {...existing, name, permissions: normalized};
  await put('members', updated);
  members = members.map(user => user.id === id ? updated : user);
  return updated;
}

function renderUsers() {
  $('userList').replaceChildren();
  for (const user of [...members].sort((a, b) => a.id.localeCompare(b.id))) {
    const form = document.createElement('form');
    form.className = 'user-card';
    form.dataset.search = `${user.id} ${user.name}`.toLocaleLowerCase();
    const heading = document.createElement('h2');
    heading.textContent = `회원번호 ${user.id}${user.id === '0026' ? ' · 관리자' : ''}`;
    const label = document.createElement('label');
    label.textContent = '이름';
    const name = document.createElement('input');
    name.value = user.name;
    name.required = true;
    name.maxLength = 30;
    label.append(name);
    const table = document.createElement('table');
    table.className = 'permissions-table';
    table.innerHTML = '<caption>게시판별 권한</caption><thead><tr><th scope="col">게시판</th><th scope="col">읽기</th><th scope="col">쓰기</th><th scope="col">수정</th><th scope="col">삭제</th></tr></thead>';
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
      for (const [action, text] of Object.entries({read:'읽기', write:'쓰기', edit:'수정', delete:'삭제'})) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = values[key][action];
        input.setAttribute('aria-label', `${user.id} ${title} ${text}`);
        inputs[key][action] = input;
        td.append(input);
        row.append(td);
      }
      tbody.append(row);
    }
    table.append(tbody);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const reset = document.createElement('button');
    reset.type = 'button';reset.className = 'quiet';reset.textContent = '기본 권한으로';
    reset.onclick = () => {
      const defaults = defaultPermissions();
      for (const key of Object.keys(inputs)) for (const action of Object.keys(inputs[key])) inputs[key][action].checked = defaults[key][action];
      status.textContent = '기본 권한을 적용하려면 변경 저장을 눌러 주세요.';
    };
    const save = document.createElement('button');
    save.type = 'submit';save.className = 'primary';save.textContent = '변경 저장';
    const status = document.createElement('p');
    status.className = 'muted';status.setAttribute('role', 'status');
    actions.append(reset, save);
    form.append(heading, label, table, actions, status);
    form.onsubmit = async event => {
      event.preventDefault();save.disabled = true;status.textContent = '저장 중…';
      const permissions = Object.fromEntries(Object.entries(inputs).map(([key, controls]) => [key, Object.fromEntries(Object.entries(controls).map(([action, input]) => [action, input.checked]))]));
      try {
        const updated = await updateUser(user.id, name.value, permissions);
        name.value = updated.name;
        form.dataset.search = `${user.id} ${updated.name}`.toLocaleLowerCase();
        status.textContent = '이름과 권한을 저장했습니다.';
      } catch (error) {
        status.textContent = error.message || '저장하지 못했습니다.';
      } finally { save.disabled = false; }
    };
    $('userList').append(form);
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
    await initializeStore();
    if (!requireUserAdmin()) return;
    $('usersPanel').hidden = false;
    $('userSearch').oninput = filterUsers;
    renderUsers();
  } catch {
    toast('사용자 정보를 불러오지 못했습니다. 다시 열어 주세요.');
  }
})();

window.addEventListener('pageshow', async event => {
  if (event.persisted) {
    try { await refreshIdentity();requireUserAdmin(); }
    catch { location.replace('login.html?next=users.html'); }
  }
});
