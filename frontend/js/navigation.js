(() => {
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

  function setOpen(value, restoreFocus = true) {
    opened = mobile.matches && value;
    document.body.classList.toggle('menu-open', opened);
    toggle.setAttribute('aria-expanded', String(opened));
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

  toggle.onclick = () => setOpen(!opened);
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
