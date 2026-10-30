// Builds the shared sidebar (and a workspace header for pages without one) so every page shows the same menu.
function buildLayout() {
  const prefix = guestMode ? 'guest-' : '';
  const links = [['cake', '◷', '케이크 생산'], ['notice', '▤', '공지사항'], ['claim', '☎', '클레임 관리']];
  if (!guestMode) links.push(['price', '🏷', '가격표 인쇄']);
  links.push(['pos', '▦', '포스 교육']);
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `<a class="brand" href="${prefix}cake.html"><span class="logo">T</span><span>TOUS les JOURS<small>우리 매장 소식</small></span></a><div class="nav-label">매장 게시판</div><nav aria-label="게시판">${
    links.map(([key, icon, label]) => `<a href="${prefix}${key}.html" data-board="${key}">${icon} <span>${label}</span></a>`).join('')}${
    guestMode ? '' : '<a id="usersLink" href="users.html" data-board="users" hidden><span aria-hidden="true">⚙</span><span>User 관리</span></a>'
  }</nav><div class="side-bottom"><span class="status-dot"></span> 오늘도, 좋은 하루를 만듭니다.<small>매장의 소식을 한 곳에서 확인하세요.</small></div>`;
  const current = document.body.dataset.board || location.pathname.split('/').pop().replace(/^guest-/, '').replace(/(-detail)?\.html$/, '');
  sidebar.querySelector(`nav a[data-board="${current}"]`)?.classList.add('active');

  const shell = $('appShell') || document.body;
  if (!shell.querySelector('.workspace')) {
    const workspace = document.createElement('div');
    workspace.className = 'workspace';
    const header = document.createElement('header');
    header.innerHTML = `<span>매장 운영 <b>/</b> <span id="breadcrumb"></span></span>${guestMode
      ? '<button id="account" class="quiet">비회원 모드 · 회원 로그인</button>'
      : '<div class="account-actions"><a href="profile.html" class="profile-link">회원정보</a><button id="account" class="quiet">로그아웃</button></div>'}`;
    header.querySelector('#breadcrumb').textContent = document.title.split(' · ')[0];
    workspace.append(header, ...shell.querySelectorAll(':scope > main'));
    shell.prepend(workspace);
  }
  shell.prepend(sidebar);
}

(() => {
  buildLayout();
  const sidebar = document.querySelector('.sidebar');
  const workspace = document.querySelector('.workspace');
  const header = workspace?.querySelector('header');
  if (!sidebar || !header) return;

  const mobile = window.matchMedia('(max-width: 760px)');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'menu-toggle';
  toggle.textContent = '☰';
  toggle.setAttribute('aria-label', '메뉴 열기');
  sidebar.id = 'sideMenu';
  toggle.setAttribute('aria-controls', sidebar.id);
  toggle.setAttribute('aria-expanded', 'false');
  header.prepend(toggle);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'menu-close';
  close.textContent = '×';
  close.setAttribute('aria-label', '메뉴 닫기');
  sidebar.prepend(close);

  const backdrop = document.createElement('div');
  backdrop.className = 'menu-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  sidebar.before(backdrop);

  const accounts = header.querySelector('.account-actions') || header.querySelector('#account');
  const anchor = document.createComment('account menu position');
  if (accounts) accounts.before(anchor);
  const accountSlot = document.createElement('div');
  accountSlot.className = 'drawer-account';
  sidebar.querySelector('nav').after(accountSlot);
  let opened = false;

  // On wide screens the toggle hides/shows the sidebar and the choice is remembered per browser.
  function setHidden(value) {
    document.body.classList.toggle('menu-hidden', value);
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.setAttribute('aria-label', value ? '메뉴 열기' : '메뉴 숨기기');
    try { localStorage.setItem('tlj-menu-hidden', value ? '1' : ''); } catch {}
  }
  try { document.body.classList.toggle('menu-hidden', localStorage.getItem('tlj-menu-hidden') === '1'); } catch {}

  function setOpen(value, restoreFocus = true) {
    opened = mobile.matches && value;
    document.body.classList.toggle('menu-open', opened);
    toggle.setAttribute('aria-expanded', String(mobile.matches ? opened : !document.body.classList.contains('menu-hidden')));
    if (!mobile.matches) toggle.setAttribute('aria-label', document.body.classList.contains('menu-hidden') ? '메뉴 열기' : '메뉴 숨기기');
    backdrop.hidden = !opened;
    workspace.inert = opened;
    sidebar.inert = mobile.matches && !opened;
    if (mobile.matches) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-label', '매장 메뉴');
      sidebar.setAttribute('aria-hidden', String(!opened));
      if (opened) sidebar.setAttribute('aria-modal', 'true');
      else sidebar.removeAttribute('aria-modal');
    } else {
      for (const attribute of ['role', 'aria-label', 'aria-hidden', 'aria-modal']) sidebar.removeAttribute(attribute);
    }
    if (opened) close.focus();
    else if (restoreFocus && mobile.matches) toggle.focus();
  }

  function layout() {
    const focusInMenu = sidebar.contains(document.activeElement);
    if (accounts) {
      if (mobile.matches) accountSlot.append(accounts);
      else anchor.after(accounts);
    }
    setOpen(false, focusInMenu);
    if (!mobile.matches && document.activeElement === close) sidebar.querySelector('a')?.focus();
  }

  toggle.onclick = () => mobile.matches ? setOpen(!opened) : setHidden(!document.body.classList.contains('menu-hidden'));
  close.onclick = () => setOpen(false);
  backdrop.onclick = () => setOpen(false);
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (!opened) return;
    if (event.key === 'Escape') {
      event.preventDefault();setOpen(false);
    } else if (event.key === 'Tab') {
      const controls = [...sidebar.querySelectorAll('a[href],button:not([disabled])')].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
    }
  });
  mobile.addEventListener('change', layout);
  window.addEventListener('pageshow', () => setOpen(false, false));
  layout();
})();
