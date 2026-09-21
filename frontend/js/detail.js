async function showPost(id) {
  await refreshIdentity();
  let post;
  try {
    post = await api(`/api/posts/${id}`);
  } catch {
    toast('읽기 권한이 없거나 삭제된 글입니다.');
    return;
  }
  viewing = post;
  const printable = post.board === 'cake';
  $('printControls').hidden = !printable;
  $('printHint').hidden = !printable;
  $('largeText').checked = printable;
  $('paperWidth').value = '80';
  $('printArticle').classList.toggle('large', printable);
  $('printPageStyle')?.remove();
  $('detailCategory').textContent = boards[post.board][0];
  $('detailTitle').textContent = post.title;
  $('detailMeta').textContent = `작성자 ${post.author} · 작성 ${date(post.created)} · 업데이트 ${date(post.updated)}`;
  if (post.board === 'notice') $('detailBody').innerHTML = safeRich(post.body);
  else $('detailBody').textContent = post.body;
  $('detailMedia').replaceChildren(...post.media.map(mediaElement));
  $('editPost').hidden = !canEdit(post);
  $('deletePost').hidden = !canDelete(post);
  $('detailDialog').showModal();
}

function wireDetail() {
  $('deletePost').onclick = deleteCurrentPost;
  $('editPost').onclick = () => {
    $('detailDialog').close();
    openEditor(viewing).catch(() => toast('수정 화면을 열 수 없습니다.'));
  };
  $('largeText').onchange = e => $('printArticle').classList.toggle('large', e.target.checked);
  $('printPost').onclick = () => {
    if (viewing?.board !== 'cake') return;
    let style = $('printPageStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'printPageStyle';
      document.head.append(style);
    }
    const width = Number($('paperWidth').value);
    style.textContent = `@media print { @page { size: ${width}mm 297mm; margin: 3mm; } #printArticle { width: ${width - 6}mm; max-width:100%; } }`;
    window.print();
  };
}

async function deleteCurrentPost() {
  if (!viewing) return;
  const id = viewing.id;
  if (!confirm('이 게시글을 삭제할까요? 삭제한 글은 복원할 수 없습니다.')) return;
  $('deletePost').disabled = true;
  try {
    await api(`/api/posts/${id}`, { method: 'DELETE' });
    viewing = null;
    $('detailDialog').close();
    await refresh();
    toast('게시글을 삭제했습니다.');
  } catch (error) {
    toast(error.message || '삭제하지 못했습니다. 다시 시도해 주세요.');
  } finally {
    $('deletePost').disabled = false;
  }
}
