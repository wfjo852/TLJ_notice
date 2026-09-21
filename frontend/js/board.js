async function refresh() {
  await refreshIdentity();
  posts = canRead() ? await api(`/api/posts?board=${board}`) : [];
  render();
}

function render() {
  if ($('usersLink')) $('usersLink').hidden = !isUserAdmin();
  if (!canRead()) {
    $('posts').textContent = '이 게시판의 읽기 권한이 없습니다.';
    $('total').textContent = '0';
    $('pagination').replaceChildren();
    $('newPost').hidden = !canWrite();
    $('breadcrumb').textContent = $('boardTitle').textContent = boards[board][0];
    $('listTitle').textContent = boards[board][0] + ' 목록';
    $('boardDescription').textContent = boards[board][1];
    return;
  }
  $('newPost').hidden = !canWrite();
  document.querySelectorAll('[data-board]').forEach(a => a.classList.toggle('active', a.dataset.board === board));
  $('breadcrumb').textContent = $('boardTitle').textContent = boards[board][0];
  $('boardDescription').textContent = boards[board][1];
  $('listTitle').textContent = boards[board][0] + ' 목록';
  const query = $('search').value.trim().toLocaleLowerCase();
  const filtered = posts
    .filter(p => !query || (p.title + ' ' + (board === 'notice' ? textOf(p.body) : p.body)).toLocaleLowerCase().includes(query))
    .sort((a, b) => b.created.localeCompare(a.created));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  page = Math.min(page, pages);
  $('total').textContent = filtered.length;
  $('posts').replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<div class="empty-icon">▤</div><h3></h3><p></p>';
    empty.querySelector('h3').textContent = query ? '검색 결과가 없습니다.' : '아직 등록된 글이 없습니다.';
    empty.querySelector('p').textContent = query ? '다른 검색어를 입력해 주세요.' : '첫 번째 소식을 작성해 주세요.';
    $('posts').append(empty);
  } else {
    const head = document.createElement('div');
    head.className = 'row table-head';
    head.innerHTML = '<span class="number">번호</span><span>제목</span><span class="author">작성자</span><span>작성일</span>';
    $('posts').append(head);
    filtered.slice((page - 1) * 30, page * 30).forEach((p, index) => {
      const row = document.createElement('button');
      row.className = 'row';
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = filtered.length - (page - 1) * 30 - index;
      const title = document.createElement('span');
      title.className = 'row-title';
      title.textContent = p.title;
      const author = document.createElement('span');
      author.className = 'author';
      author.textContent = p.author;
      const when = document.createElement('time');
      when.dateTime = p.created;
      when.textContent = shortDate(p.created);
      row.append(number, title, author, when);
      row.onclick = () => showPost(p.id).catch(() => toast('게시글을 불러오지 못했습니다.'));
      $('posts').append(row);
    });
  }
  $('pagination').replaceChildren();
  function pageButton(label, target, active = false) {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = target < 1 || target > pages;
    if (active) b.setAttribute('aria-current', 'page');
    b.onclick = () => { page = target; render(); };
    $('pagination').append(b);
  }
  pageButton('‹', page - 1);
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) pageButton(i, i, i === page);
  pageButton('›', page + 1);
}

function mediaElement(item) {
  const element = document.createElement(item.kind === 'image' ? 'img' : 'video');
  element.src = item.url;
  if (item.kind === 'video') { element.controls = true; element.preload = 'metadata'; }
  else element.alt = item.name;
  return element;
}

function wire() {
  $('search').oninput = () => { page = 1; render(); };
  $('newPost').onclick = () => openEditor().catch(() => toast('작성 화면을 열 수 없습니다.'));
  $('account').onclick = () => { if (guestMode) { location.href = 'login.html'; return; } logout(); };
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  wireEditor();
  wireDetail();
}

(async () => {
  try {
    board = document.body.dataset.board;
    await refreshIdentity();
    if (!guestMode && !currentMember()) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()));
      return;
    }
    $('appShell').hidden = false;
    $('account').textContent = guestMode ? '비회원 모드 · 회원 로그인' : `${currentMember().name} · 로그아웃`;
    wire();
    await refresh();
    window.dispatchEvent(new Event('tlj:ready'));
  } catch {
    toast('서버에 연결할 수 없습니다. 다시 열어 주세요.');
  }
})();

window.addEventListener('pageshow', event => {
  if (event.persisted && !guestMode) {
    refreshIdentity().then(() => { if (!currentMember()) location.replace('login.html'); });
  }
});
