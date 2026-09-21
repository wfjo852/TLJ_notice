const postId = new URLSearchParams(location.search).get('id');
async function loadPostPage() {
  $('pageStatus').textContent = '게시글을 불러오는 중입니다.';
  $('pageStatus').hidden = false;
  $('detailPage').hidden = true;
  try {
    await refreshIdentity();
    if (!guestMode && !currentMember()) { loginForCurrentPage(); return; }
    if (!postId) throw Error('게시글 주소를 확인해 주세요.');
    const post = await api(`/api/posts/${encodeURIComponent(postId)}`);
    viewing = post;
    board = post.board;
    document.title = `${post.title} · ${boards[board][0]} · TLJ`;
    const printable = board === 'cake';
    $('printControls').hidden = !printable;
    $('printHint').hidden = !printable;
    $('largeText').checked = printable;
    $('paperWidth').value = '80';
    $('printArticle').classList.toggle('large', printable);
    $('printPageStyle')?.remove();
    $('detailCategory').textContent = boards[board][0];
    $('detailTitle').textContent = post.title;
    $('detailMeta').textContent = `작성자 ${post.author} · 작성 ${date(post.created)} · 업데이트 ${date(post.updated)}`;
    if (board === 'notice') $('detailBody').innerHTML = safeRich(post.body);
    else $('detailBody').textContent = post.body;
    $('detailMedia').replaceChildren(...post.media.map(mediaElement));
    $('editPost').hidden = !canEdit(post);
    $('editPost').href = editorUrl(board, post.id);
    $('deletePost').hidden = !canDelete(post);
    $('backToList').href = listUrl();
    $('memberView').hidden = !guestMode;
    $('memberView').href = 'login.html?next=' + encodeURIComponent(postUrl(post.id, false));
    $('shareLink').value = new URL(postUrl(post.id, true), location.href).href;
    $('pageStatus').hidden = true;
    $('detailPage').hidden = false;
  } catch (error) {
    $('pageStatus').textContent = error.message || '게시글을 불러오지 못했습니다.';
  }
}
$('copyPostLink').onclick = async () => {
  try {
    if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText($('shareLink').value);
    toast('링크를 복사했습니다.');
  } catch {
    $('sharePanel').hidden = false;
    $('shareLink').focus();
    $('shareLink').select();
    toast('선택된 링크를 복사해 전달해 주세요.');
  }
};
$('largeText').onchange = event => $('printArticle').classList.toggle('large', event.target.checked);
$('printPost').onclick = () => {
  if (viewing?.board !== 'cake') return;
  let style = $('printPageStyle');
  if (!style) { style = document.createElement('style'); style.id = 'printPageStyle'; document.head.append(style); }
  const width = Number($('paperWidth').value);
  style.textContent = `@media print { @page { size: ${width}mm 297mm; margin: 3mm; } #printArticle { width: ${width - 6}mm; max-width:100%; } }`;
  window.print();
};
$('deletePost').onclick = async () => {
  if (!viewing || !confirm('이 게시글을 삭제할까요? 삭제한 글은 복원할 수 없습니다.')) return;
  $('deletePost').disabled = true;
  try {
    await api(`/api/posts/${encodeURIComponent(viewing.id)}`, { method: 'DELETE' });
    location.replace(listUrl());
  } catch (error) {
    toast(error.message || '삭제하지 못했습니다.');
    $('deletePost').disabled = false;
  }
};
loadPostPage();
window.addEventListener('pageshow', event => { if (event.persisted) loadPostPage(); });
