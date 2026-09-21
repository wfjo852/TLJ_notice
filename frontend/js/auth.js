const registration = document.body.dataset.page === 'register';
const requestedPage = new URLSearchParams(location.search).get('next');
const destination = ['cake.html', 'notice.html', 'request.html', 'profile.html', 'users.html'].includes(requestedPage) ? requestedPage : 'cake.html';

async function authenticate() {
  const id = $('memberCode').value;
  const name = $('memberName')?.value.trim() || '';
  $('loginError').textContent = '';
  if (!/^[0-9]{4}$/.test(id)) { $('loginError').textContent = '4자리 회원번호를 입력해 주세요.'; return; }
  if (registration && !name) { $('loginError').textContent = '회원가입 시 이름을 입력해 주세요.'; return; }
  $('authSubmit').disabled = true;
  try {
    if (registration) await api('/api/auth/register', { method: 'POST', body: { id, name } });
    else await api('/api/auth/login', { method: 'POST', body: { id } });
    location.replace(destination);
  } catch (error) {
    $('loginError').textContent = error.message || '처리하지 못했습니다. 서버 연결을 확인해 주세요.';
  } finally {
    $('authSubmit').disabled = false;
  }
}

(async () => {
  try {
    await refreshIdentity();
    if (currentMember() && !registration) { location.replace(destination); return; }
    $('memberForm').onsubmit = e => { e.preventDefault(); authenticate(); };
    $('authSubmit').disabled = false;
  } catch {
    $('loginError').textContent = '서버에 연결할 수 없습니다.';
  }
})();
