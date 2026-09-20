function requireProfileMember() {
  if (!currentMember() || sessionStorage.getItem('tlj-session') !== member) {
    location.replace('login.html?next=profile.html');
    return false;
  }
  return true;
}

async function saveProfile() {
  if (!requireProfileMember()) return;
  const name = $('profileName').value.trim();
  $('profileError').textContent = '';
  $('profileStatus').textContent = '';
  if (!name || name.length > 30) {
    $('profileError').textContent = '이름을 1~30자로 입력해 주세요.';
    return;
  }
  $('saveProfile').disabled = true;
  try {
    const savedMember = await get('members', member);
    if (!savedMember || !requireProfileMember()) {
      if (!savedMember) location.replace('login.html?next=profile.html');
      return;
    }
    const updated = {...savedMember, name};
    await put('members', updated);
    members = members.map(user => user.id === updated.id ? updated : user);
    $('profileName').value = name;
    $('profileStatus').textContent = '이름을 변경했습니다.';
  } catch {
    $('profileError').textContent = '저장하지 못했습니다. 다시 시도해 주세요.';
  } finally {
    $('saveProfile').disabled = false;
  }
}

(async () => {
  try {
    await initializeStore();
    if (!requireProfileMember()) return;
    $('profileCode').value = member;
    $('profileName').value = currentMember().name;
    $('profileForm').onsubmit = event => {
      event.preventDefault();
      saveProfile();
    };
    $('profilePanel').hidden = false;
    $('saveProfile').disabled = false;
  } catch {
    toast('회원정보를 불러오지 못했습니다. 다시 열어 주세요.');
  }
})();

window.addEventListener('pageshow', event => {
  if (event.persisted) requireProfileMember();
});
