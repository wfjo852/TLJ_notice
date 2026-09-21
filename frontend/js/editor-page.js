function editorReturnUrl() {
  return editing ? postUrl(editing) : listUrl();
}
(async () => {
  try {
    await refreshIdentity();
    if (!guestMode && !currentMember()) { loginForCurrentPage(); return; }
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    let post = null;
    if (id) {
      post = await api(`/api/posts/${encodeURIComponent(id)}`);
      board = post.board;
    } else { board = params.get('board'); }
    if (!boards[board]) throw Error('게시판 주소를 확인해 주세요.');
    if (post ? !canEdit(post) : !canWrite()) throw Error('작성 또는 수정 권한이 없습니다.');
    wireEditor();
    document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
    await openEditor(post);
    document.title = `${post ? '글 수정' : '새 글 작성'} · ${boards[board][0]} · TLJ`;
    $('pageStatus').hidden = true;
  } catch (error) {
    $('pageStatus').textContent = error.message || '작성 화면을 불러오지 못했습니다.';
  }
})();
