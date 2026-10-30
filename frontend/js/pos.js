'use strict';

const POS_SLOTS = 20, POS_MAX_PAGES = 20;
let pos = { categories: [], products: [], canEdit: false };
let section = 'bread', categoryId = null, posPage = 0, selected = null, dragging = null;

const productById = id => pos.products.find(p => p.id === id);
const sectionCategories = () => pos.categories.filter(c => c.section === section);
const currentCategory = () => pos.categories.find(c => c.id === categoryId);
const cellAt = (cat, pg, slot) => cat?.cells.find(c => c[0] === pg && c[1] === slot);
const won = value => value == null ? '' : Number(value).toLocaleString('ko-KR') + '원';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, onclick, className = 'mini', label) {
  const node = el('button', className, text);
  node.type = 'button';
  node.onclick = onclick;
  if (label) node.setAttribute('aria-label', label);
  return node;
}

async function loadPos() {
  pos = await api('/api/pos');
  if (!currentCategory() || currentCategory().section !== section) categoryId = sectionCategories()[0]?.id ?? null;
  const cat = currentCategory();
  posPage = cat ? Math.min(posPage, cat.pages - 1) : 0;
  if (selected && !productById(selected.productId)) selected = null;
  renderPos();
}

function productFace(product, holder) {
  if (product.image) {
    const img = el('img');
    img.src = product.image;
    img.alt = '';
    img.loading = 'lazy';
    holder.append(img);
  }
  holder.append(el('b', '', product.name));
  holder.append(el('span', 'price', won(product.price)));
}

function renderCategories() {
  const list = $('cats');
  list.replaceChildren();
  const cats = sectionCategories();
  if (!cats.length) list.append(el('p', 'muted', '분류가 없습니다.'));
  cats.forEach((cat, index) => {
    const row = el('div', 'pos-cat');
    const open = button(cat.name, () => { categoryId = cat.id; posPage = 0; renderPos(); }, cat.id === categoryId ? 'active' : '');
    row.append(open);
    if (document.body.classList.contains('editing')) {
      row.append(
        button('▲', () => moveCategory(index, -1), 'mini', '위로'),
        button('▼', () => moveCategory(index, 1), 'mini', '아래로'),
        button('✎', () => renameCategory(cat), 'mini', '이름 변경'),
        button('✕', () => deleteCategory(cat), 'mini', '삭제'),
      );
    }
    list.append(row);
  });
}

function renderGrid() {
  const grid = $('grid');
  grid.replaceChildren();
  const cat = currentCategory();
  const editing = document.body.classList.contains('editing');
  for (let slot = 0; slot < POS_SLOTS; slot++) {
    const cell = el('div', 'pos-cell');
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    const placed = cellAt(cat, posPage, slot);
    const product = placed && productById(placed[2]);
    if (product) {
      productFace(product, cell);
      cell.title = product.name;
      cell.setAttribute('aria-label', `${product.name} ${won(product.price)}`);
      if (selected?.categoryId === cat.id && selected.page === posPage && selected.slot === slot) cell.classList.add('selected');
      if (editing) {
        cell.draggable = true;
        cell.ondragstart = event => {
          dragging = { productId: product.id, categoryId: cat.id, page: posPage, slot };
          event.dataTransfer.effectAllowed = 'move';
        };
      }
    } else {
      cell.classList.add('vacant');
      cell.setAttribute('aria-label', `빈 칸 ${slot + 1}`);
    }
    cell.onclick = () => clickCell(slot, product);
    cell.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cell.click(); } };
    if (editing) {
      cell.ondragover = event => { if (dragging) { event.preventDefault(); cell.classList.add('drop'); } };
      cell.ondragleave = () => cell.classList.remove('drop');
      cell.ondrop = event => { event.preventDefault(); const source = dragging; dragging = null; placeProduct(source, slot); };
    }
    grid.append(cell);
  }
  const pages = cat?.pages || 1;
  $('pageInfo').textContent = `${posPage + 1} / ${pages}`;
  $('prevPage').disabled = posPage === 0;
  $('nextPage').disabled = posPage >= pages - 1;
  for (const id of ['addPage', 'removePage']) $(id).disabled = !cat;
  $('grid').classList.toggle('disabled', !cat);
}

function renderSelection() {
  const info = $('selInfo');
  info.replaceChildren();
  const product = selected && productById(selected.productId);
  if (!product) {
    info.append(el('span', 'muted', '제품을 선택하세요.'));
  } else {
    const title = el('div', 'sel-title');
    title.append(el('b', '', product.name), el('span', 'price', won(product.price)));
    if (product.prodNum) title.append(el('span', 'muted', `No.${product.prodNum}`));
    info.append(title);
    if (product.description) info.append(el('p', 'desc', product.description));
    if (product.content) info.append(el('p', 'memo', product.content));
  }
  $('detailBtn').disabled = !product?.prodNum;
  if ($('editProduct')) $('editProduct').disabled = !product;
  $('unplace').disabled = selected?.slot == null;
}

function renderPool() {
  if (!pos.canEdit) return;
  const list = $('poolList');
  const query = $('poolSearch').value.trim().toLowerCase();
  list.replaceChildren();
  const products = pos.products.filter(p => !query || p.name.toLowerCase().includes(query) || String(p.prodNum ?? '').includes(query));
  $('poolCount').textContent = pos.products.length;
  if (!products.length) list.append(el('p', 'muted', pos.products.length ? '검색 결과가 없습니다.' : '제품을 추가해 주세요.'));
  for (const product of products) {
    const item = el('div', 'pool-item');
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.draggable = true;
    if (selected?.slot == null && selected?.productId === product.id) item.classList.add('selected');
    productFace(product, item);
    const count = pos.categories.filter(c => c.cells.some(x => x[2] === product.id)).length;
    item.append(el('small', 'muted', count ? `분류 ${count}곳` : '미배치'));
    item.ondragstart = event => { dragging = { productId: product.id, slot: null }; event.dataTransfer.effectAllowed = 'copy'; };
    item.onclick = () => { selected = selected && selected.slot == null && selected.productId === product.id ? null : { productId: product.id, slot: null }; renderPos(); };
    item.onkeydown = event => { if (event.key === 'Enter') item.click(); };
    list.append(item);
  }
}

function renderPos() {
  document.querySelectorAll('[data-section]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.section === section)));
  renderCategories();
  renderGrid();
  renderSelection();
  renderPool();
}

function clickCell(slot, product) {
  const cat = currentCategory();
  if (!cat) return;
  const editing = document.body.classList.contains('editing');
  if (!product) {
    if (editing && selected) placeProduct(selected, slot);
    else { selected = null; renderPos(); }
    return;
  }
  const same = selected?.categoryId === cat.id && selected.page === posPage && selected.slot === slot;
  selected = same ? null : { productId: product.id, categoryId: cat.id, page: posPage, slot };
  renderPos();
}

async function saveLayout(cat, pages, cells) {
  try {
    await api(`/api/pos/categories/${cat.id}/layout`, { method: 'PUT', body: { pages, cells } });
    cat.pages = pages;
    cat.cells = cells;
    posPage = Math.min(posPage, pages - 1);
  } catch (error) {
    toast(error.message);
    await loadPos();
    return;
  }
  renderPos();
}

// Moves within the same category (swapping with an occupant); copies from the pool or another category.
function placeProduct(source, slot) {
  const cat = currentCategory();
  if (!cat || !source) return;
  const moving = source.slot != null && source.categoryId === cat.id;
  if (moving && source.page === posPage && source.slot === slot) return;
  const target = cellAt(cat, posPage, slot);
  const cells = cat.cells.filter(c => c !== target && !(moving && c[0] === source.page && c[1] === source.slot));
  cells.push([posPage, slot, source.productId]);
  if (moving && target) cells.push([source.page, source.slot, target[2]]);
  selected = { productId: source.productId, categoryId: cat.id, page: posPage, slot };
  saveLayout(cat, cat.pages, cells);
}

function unplaceSelected() {
  const cat = pos.categories.find(c => c.id === selected?.categoryId);
  if (!cat || selected.slot == null) return;
  const cells = cat.cells.filter(c => !(c[0] === selected.page && c[1] === selected.slot));
  selected = null;
  saveLayout(cat, cat.pages, cells);
}

function addPage() {
  const cat = currentCategory();
  if (!cat) return;
  if (cat.pages >= POS_MAX_PAGES) { toast(`페이지는 ${POS_MAX_PAGES}개까지 만들 수 있습니다.`); return; }
  posPage = cat.pages;
  saveLayout(cat, cat.pages + 1, cat.cells);
}

function removePage() {
  const cat = currentCategory();
  if (!cat) return;
  if (cat.pages <= 1) { toast('마지막 페이지는 삭제할 수 없습니다.'); return; }
  if (cat.cells.some(c => c[0] === posPage) && !confirm('이 페이지의 제품 배치를 지울까요? 제품 자체는 삭제되지 않습니다.')) return;
  const cells = cat.cells.filter(c => c[0] !== posPage).map(c => c[0] > posPage ? [c[0] - 1, c[1], c[2]] : c);
  if (selected?.categoryId === cat.id) selected = null;
  saveLayout(cat, cat.pages - 1, cells);
}

async function posAction(action) {
  try {
    await action();
  } catch (error) {
    toast(error.message);
  }
  await loadPos();
}

function addCategory() {
  const name = prompt('새 분류 이름')?.trim();
  if (!name) return;
  posAction(async () => {
    const result = await api('/api/pos/categories', { method: 'POST', body: { section, name } });
    categoryId = result.id;
    posPage = 0;
  });
}

function renameCategory(cat) {
  const name = prompt('분류 이름', cat.name)?.trim();
  if (!name || name === cat.name) return;
  posAction(() => api(`/api/pos/categories/${cat.id}`, { method: 'PATCH', body: { name } }));
}

function deleteCategory(cat) {
  if (!confirm(`'${cat.name}' 분류를 삭제할까요? 제품 자체는 삭제되지 않습니다.`)) return;
  posAction(() => api(`/api/pos/categories/${cat.id}`, { method: 'DELETE' }));
}

function moveCategory(index, step) {
  const ids = sectionCategories().map(c => c.id);
  const to = index + step;
  if (to < 0 || to >= ids.length) return;
  [ids[index], ids[to]] = [ids[to], ids[index]];
  posAction(() => api('/api/pos/categories/order', { method: 'PUT', body: { ids } }));
}

function openProduct(product) {
  $('productId').value = product.id;
  $('productNum').textContent = product.prodNum ? `제품번호 ${product.prodNum}` : '수동 등록 제품';
  $('productName').value = product.name;
  $('productDescription').value = product.description;
  $('productContent').value = product.content;
  $('productPrice').value = product.price ?? '';
  $('productImage').value = '';
  $('productPreview').hidden = !product.image;
  if (product.image) $('productPreview').src = product.image;
  $('refreshProduct').hidden = !product.prodNum;
  $('productError').textContent = '';
  $('productDialog').showModal();
}

function wireEditing() {
  $('editToggle').hidden = false;
  $('editToggle').onclick = () => {
    const editing = document.body.classList.toggle('editing');
    $('editToggle').textContent = editing ? '편집 완료' : '편집';
    $('editToggle').setAttribute('aria-pressed', String(editing));
    selected = null;
    renderPos();
  };
  $('addCat').onclick = addCategory;
  $('addPage').onclick = addPage;
  $('removePage').onclick = removePage;
  $('unplace').onclick = unplaceSelected;
  $('editProduct').onclick = () => { const product = selected && productById(selected.productId); if (product) openProduct(product); };
  $('poolSearch').oninput = renderPool;
  $('poolList').ondragover = event => { if (dragging?.slot != null) event.preventDefault(); };
  $('poolList').ondrop = event => {
    event.preventDefault();
    const source = dragging;
    dragging = null;
    if (source?.slot == null) return;
    selected = source;
    unplaceSelected();
  };
  document.addEventListener('dragend', () => { dragging = null; document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
  document.querySelectorAll('[data-close]').forEach(close => close.onclick = () => $(close.dataset.close).close());

  $('addProduct').onclick = () => { $('addForm').reset(); $('addError').textContent = ''; $('addDialog').showModal(); };
  $('addForm').onsubmit = async event => {
    event.preventDefault();
    const prodNum = $('addNum').value.trim(), name = $('addName').value.trim();
    if (!prodNum && !name) { $('addError').textContent = '제품번호 또는 제품명을 입력해 주세요.'; return; }
    $('addSubmit').disabled = true;
    $('addSubmit').textContent = prodNum ? '가져오는 중…' : '추가 중…';
    try {
      const product = await api('/api/pos/products', { method: 'POST', body: prodNum ? { prodNum } : { name } });
      $('addDialog').close();
      selected = { productId: product.id, slot: null };
      await loadPos();
      openProduct(product);
    } catch (error) {
      $('addError').textContent = error.message;
    } finally {
      $('addSubmit').disabled = false;
      $('addSubmit').textContent = '추가';
    }
  };

  $('productForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('productId').value, price = $('productPrice').value.trim();
    $('productSave').disabled = true;
    try {
      await api(`/api/pos/products/${id}`, { method: 'PUT', body: {
        name: $('productName').value, description: $('productDescription').value,
        content: $('productContent').value, price: price === '' ? null : Number(price),
      } });
      const file = $('productImage').files[0];
      if (file) {
        const form = new FormData();
        form.append('file', file);
        await api(`/api/pos/products/${id}/image`, { method: 'POST', body: form });
      }
      $('productDialog').close();
      toast('제품을 저장했습니다.');
      await loadPos();
    } catch (error) {
      $('productError').textContent = error.message;
    } finally {
      $('productSave').disabled = false;
    }
  };
  $('refreshProduct').onclick = async () => {
    try {
      const product = await api(`/api/pos/products/${$('productId').value}/refresh`, { method: 'POST' });
      $('productDescription').value = product.description;
      $('productPreview').src = product.image || '';
      $('productPreview').hidden = !product.image;
      toast('홈페이지의 설명과 이미지로 갱신했습니다.');
      await loadPos();
    } catch (error) {
      $('productError').textContent = error.message;
    }
  };
  $('deleteProduct').onclick = () => {
    if (!confirm('이 제품을 삭제할까요? 모든 분류의 그리드에서도 빠집니다.')) return;
    $('productDialog').close();
    selected = null;
    posAction(() => api(`/api/pos/products/${$('productId').value}`, { method: 'DELETE' }));
  };
}

(async () => {
  try {
    await refreshIdentity();
    if (!guestMode && !currentMember()) { loginForCurrentPage(); return; }
    document.querySelectorAll('[data-section]').forEach(tab => tab.onclick = () => {
      section = tab.dataset.section;
      categoryId = sectionCategories()[0]?.id ?? null;
      posPage = 0;
      renderPos();
    });
    $('prevPage').onclick = () => { posPage = Math.max(0, posPage - 1); renderPos(); };
    $('nextPage').onclick = () => { posPage = Math.min((currentCategory()?.pages || 1) - 1, posPage + 1); renderPos(); };
    $('detailBtn').onclick = () => {
      const product = selected && productById(selected.productId);
      if (product?.prodNum) window.open(`https://www.tlj.co.kr/product/detail.asp?prod_num=${product.prodNum}`, '_blank', 'noopener');
    };
    await loadPos();
    if (pos.canEdit) wireEditing();
  } catch {
    toast('서버에 연결할 수 없습니다. 다시 열어 주세요.');
  }
})();
