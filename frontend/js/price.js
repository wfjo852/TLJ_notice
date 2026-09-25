'use strict';

let priceItems = [];
let pricePreset = 'simple';
let priceNextId = 1;

function wonFormat(value) {
  return Number(value).toLocaleString('ko-KR') + '원';
}

function priceTagElement(item) {
  const tag = document.createElement('div');
  tag.className = `price-tag preset-${pricePreset}`;
  if (pricePreset === 'classic') {
    const brand = document.createElement('div');
    brand.className = 'p-brand';
    brand.textContent = 'TOUS les JOURS';
    tag.append(brand);
  }
  const name = document.createElement('div');
  name.className = 'p-name';
  name.textContent = item.name;
  const price = document.createElement('div');
  price.className = 'p-price';
  price.textContent = wonFormat(item.price);
  tag.append(name, price);
  return tag;
}

function renderPreview() {
  const area = $('printArea');
  area.replaceChildren();
  if (!priceItems.length) {
    const empty = document.createElement('p');
    empty.className = 'price-empty';
    empty.textContent = '추가된 가격표가 없습니다.';
    area.append(empty);
    return;
  }
  for (const item of priceItems) {
    for (let i = 0; i < item.qty; i++) area.append(priceTagElement(item));
  }
}

function renderQueue() {
  $('tagCount').textContent = priceItems.reduce((sum, item) => sum + item.qty, 0);
  $('tagEmpty').hidden = priceItems.length > 0;
  $('tagQueue').replaceChildren();
  for (const item of priceItems) {
    const row = document.createElement('div');
    row.className = 'tag-row';
    const info = document.createElement('span');
    info.className = 'tag-info';
    info.textContent = `${item.name} × ${item.qty}`;
    const price = document.createElement('span');
    price.className = 'tag-price';
    price.textContent = wonFormat(item.price);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '삭제';
    remove.onclick = () => {
      priceItems = priceItems.filter(entry => entry.id !== item.id);
      render();
    };
    row.append(info, price, remove);
    $('tagQueue').append(row);
  }
}

function render() {
  renderQueue();
  renderPreview();
}

function setPreset(next) {
  pricePreset = next;
  document.querySelectorAll('.preset-option').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.preset === next));
  });
  renderPreview();
}

function wirePrice() {
  document.querySelectorAll('.preset-option').forEach(button => {
    button.onclick = () => setPreset(button.dataset.preset);
  });
  $('addTag').onclick = () => {
    const name = $('tagName').value.trim();
    const priceValue = $('tagPrice').value;
    const price = Number(priceValue);
    const qty = Math.max(1, Math.floor(Number($('tagQty').value) || 1));
    if (!name) { toast('제품명을 입력해 주세요.'); $('tagName').focus(); return; }
    if (priceValue === '' || Number.isNaN(price) || price < 0) { toast('가격을 입력해 주세요.'); $('tagPrice').focus(); return; }
    priceItems.push({ id: priceNextId++, name, price, qty });
    $('tagName').value = '';
    $('tagPrice').value = '';
    $('tagQty').value = '1';
    $('tagName').focus();
    render();
  };
  $('clearTags').onclick = () => {
    if (!priceItems.length) return;
    if (!confirm('추가된 가격표를 모두 삭제할까요?')) return;
    priceItems = [];
    render();
  };
  $('printTags').onclick = () => {
    if (!priceItems.length) { toast('인쇄할 가격표를 먼저 추가해 주세요.'); return; }
    let style = $('printPageStyle');
    if (!style) { style = document.createElement('style'); style.id = 'printPageStyle'; document.head.append(style); }
    style.textContent = '@media print { @page { size: 80mm 297mm; margin: 3mm; } #printArea { width: 74mm; max-width:100%; } }';
    window.print();
  };
}

(async () => {
  try {
    await refreshIdentity();
    if (!guestMode && !currentMember()) { loginForCurrentPage(); return; }
    wirePrice();
    render();
  } catch {
    toast('서버에 연결할 수 없습니다. 다시 열어 주세요.');
  }
})();
