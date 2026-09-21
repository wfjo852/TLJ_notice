function renderAttachments() {
  $('attachments').replaceChildren();
  media.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'attachment';
    const name = document.createElement('span');
    name.textContent = item.name;
    row.append(mediaElement(item), name);
    if (item.kind === 'image') {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = '수정 / 그리기';
      edit.onclick = () => openImage(index);
      row.append(edit);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '삭제';
    remove.onclick = () => removeAttachment(index);
    row.append(remove);
    $('attachments').append(row);
  });
}

function draftScope() {
  return `${board}/${editing || 'new'}`;
}

function mediaScopeUrl() {
  return editing ? `/api/posts/${editing}/media` : `/api/drafts/${draftScope()}/media`;
}

async function removeAttachment(index) {
  const item = media[index];
  media.splice(index, 1);
  renderAttachments();
  try { await api(`${mediaScopeUrl()}/${item.id}`, { method: 'DELETE' }); }
  catch { toast('첨부파일 삭제에 실패했습니다.'); }
}

function snapshot() {
  return {
    title: $('postTitle').value,
    body: board === 'notice' ? safeRich($('richBody').innerHTML) : $('plainBody').value,
    guest: $('guestName').value,
  };
}

function queueDraft() {
  if (!editorOpen) return draftQueue;
  const value = snapshot();
  $('draftStatus').textContent = '임시저장 중…';
  draftQueue = draftQueue.catch(() => {}).then(() => api(`/api/drafts/${draftScope()}`, { method: 'PUT', body: value }));
  draftQueue.then(() => {
    $('draftStatus').textContent = '임시저장 완료 · 새로고침해도 내용이 유지됩니다.';
  }, () => {
    $('draftStatus').textContent = '저장 실패 · 서버 연결을 확인해 주세요.';
  });
  return draftQueue;
}

async function openEditor(post = null) {
  await refreshIdentity();
  if (post ? !canEdit(post) : !canWrite()) { toast('이 페이지에서는 작성 또는 수정할 수 없습니다.'); return; }
  editing = post?.id || null;
  let draft = null;
  try { draft = await api(`/api/drafts/${draftScope()}`); } catch { draft = null; }
  const value = draft || post;
  media = editing ? [...(post.media || [])] : (draft?.media ? [...draft.media] : []);
  $('postTitle').value = value?.title || (board === 'cake' ? tomorrowTitle() : '');
  $('plainBody').value = board === 'notice' ? '' : value?.body || '';
  $('richBody').innerHTML = board === 'notice' ? safeRich(value?.body || '') : '';
  $('guestName').value = value?.guest || '';
  $('guestLabel').hidden = !!currentMember();
  $('richBody').hidden = board !== 'notice';
  $('richTools').hidden = board !== 'notice';
  $('plainBody').hidden = board === 'notice';
  $('editorHeading').textContent = post ? '게시글 수정' : '새 글 작성';
  $('editorCategory').textContent = boards[board][0];
  $('savePost').textContent = post ? '수정 저장' : '게시하기';
  $('draftStatus').textContent = draft ? '저장된 작성 내용을 불러왔습니다.' : '작성 내용은 자동으로 임시저장됩니다.';
  renderAttachments();
  editorOpen = true;
  $('editorPage').hidden = false;
  $('postTitle').focus();
}

async function closeEditor() {
  if (mediaBusy) { toast('첨부파일 처리 후 닫아 주세요.'); return; }
  try {
    await queueDraft();
    editorOpen = false;
    location.href = editorReturnUrl();
  } catch {
    toast('임시저장에 실패했습니다. 내용을 복사해 보관해 주세요.');
  }
}

async function addFile(file, kind) {
  if (!file) return;
  const types = kind === 'image' ? ['image/png', 'image/jpeg', 'image/webp'] : ['video/mp4', 'video/webm'];
  if (!types.includes(file.type)) { toast('지원하지 않는 파일 형식입니다.'); return; }
  if (file.size > (kind === 'image' ? 10 : 50) * 1024 * 1024) {
    toast(kind === 'image' ? '이미지는 10MB 이하로 첨부해 주세요.' : '동영상은 50MB 이하로 첨부해 주세요.');
    return;
  }
  if (media.length >= 10) { toast('첨부파일은 최대 10개까지 가능합니다.'); return; }
  mediaBusy = true;
  $('savePost').disabled = true;
  try {
    let blob = file;
    if (kind === 'image') {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error();
    }
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', blob, kind === 'image' ? file.name.replace(/\.[^.]+$/, '') + '.png' : file.name);
    const created = await api(mediaScopeUrl(), { method: 'POST', body: form });
    media.push(created);
    renderAttachments();
    await queueDraft();
  } catch {
    toast('첨부 실패 · 파일 또는 서버 저장 공간을 확인해 주세요.');
  } finally {
    mediaBusy = false;
    $('savePost').disabled = false;
  }
}

async function drawBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = $('imageCanvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
}

async function openImage(index) {
  imageIndex = index;
  try {
    const response = await fetch(mediaUrl(media[index].url), { credentials: 'same-origin' });
    if (!response.ok) throw Error();
    originalImage = await response.blob();
    await drawBlob(originalImage);
    $('imageDialog').showModal();
  } catch {
    toast('이미지를 열 수 없습니다.');
  }
}

function wireEditor() {
  ['postTitle', 'plainBody', 'richBody', 'guestName'].forEach(id => $(id).addEventListener('input', queueDraft));
  $('richBody').addEventListener('paste', e => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    queueDraft();
  });
  $('richBody').addEventListener('drop', e => e.preventDefault());
  document.querySelectorAll('[data-format]').forEach(b => {
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => { $('richBody').focus(); document.execCommand(b.dataset.format, false); queueDraft(); };
  });
  $('imageInput').onchange = e => { addFile(e.target.files[0], 'image'); e.target.value = ''; };
  $('videoInput').onchange = e => { addFile(e.target.files[0], 'video'); e.target.value = ''; };
  $('closeEditor').onclick = closeEditor;
  $('discardDraft').onclick = async () => {
    if (mediaBusy) return;
    if (!confirm('작성 중인 내용을 삭제할까요?')) return;
    try {
      await draftQueue.catch(() => {});
      await api(`/api/drafts/${draftScope()}`, { method: 'DELETE' });
      editorOpen = false;
      location.href = editorReturnUrl();
    } catch {
      toast('임시저장을 삭제하지 못했습니다.');
    }
  };

  $('postForm').onsubmit = async e => {
    e.preventDefault();
    if (mediaBusy) return;
    const value = snapshot();
    const plain = board === 'notice' ? textOf(value.body) : value.body;
    if (!value.title.trim() || (!plain.trim() && !media.length)) { toast('제목과 내용을 입력해 주세요.'); return; }
    $('savePost').disabled = true;
    try {
      await refreshIdentity();
      await queueDraft();
      const payload = { title: value.title.trim(), body: value.body, guestName: value.guest.trim() };
      let saved;
      if (editing) {
        saved = await api(`/api/posts/${editing}`, { method: 'PUT', body: payload });
        await api(`/api/drafts/${draftScope()}`, { method: 'DELETE' });
      } else {
        payload.board = board;
        saved = await api('/api/posts', { method: 'POST', body: payload });
      }
      editorOpen = false;
      location.replace(postUrl(saved.id));
    } catch (error) {
      toast(error.message || '저장하지 못했습니다. 서버 연결을 확인해 주세요.');
    } finally {
      $('savePost').disabled = false;
    }
  };

  const canvas = $('imageCanvas');
  const point = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };
  canvas.onpointerdown = e => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const context = canvas.getContext('2d');
    context.beginPath();
    context.moveTo(...point(e));
    context.strokeStyle = $('penColor').value;
    context.lineWidth = Number($('penSize').value) * canvas.width / canvas.clientWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  };
  canvas.onpointermove = e => {
    if (!drawing) return;
    const context = canvas.getContext('2d');
    context.lineTo(...point(e));
    context.stroke();
  };
  canvas.onpointerup = canvas.onpointercancel = () => drawing = false;
  $('rotateImage').onclick = () => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    canvas.width = copy.height;
    canvas.height = copy.width;
    const context = canvas.getContext('2d');
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(copy, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
  };
  $('resetImage').onclick = () => drawBlob(originalImage);
  $('applyImage').onclick = () => {
    canvas.toBlob(async blob => {
      if (!blob) { toast('이미지를 저장하지 못했습니다.'); return; }
      try {
        const form = new FormData();
        form.append('kind', 'image');
        form.append('file', blob, media[imageIndex].name);
        const updated = await api(`${mediaScopeUrl()}/${media[imageIndex].id}`, { method: 'PUT', body: form });
        media[imageIndex] = updated;
        renderAttachments();
        $('imageDialog').close();
        await queueDraft();
      } catch {
        toast('이미지 저장에 실패했습니다.');
      }
    }, 'image/png');
  };
  window.addEventListener('beforeunload', e => {
    if (mediaBusy || $('draftStatus').textContent === '임시저장 중…') { e.preventDefault(); e.returnValue = ''; }
  });
}
