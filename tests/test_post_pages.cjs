const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../frontend');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(file,query,member=null,post=null){
  const nodes=new Map(), redirects=[], calls=[];
  const element=()=>({hidden:false,value:'',textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}},append(){},replaceChildren(){},addEventListener(){},focus(){},select(){this.selected=true},remove(){}});
  for(const [,id]of read(file).matchAll(/id="([^"]+)"/g))nodes.set(id,element());
  const url=new URL('http://store.test/'+file+query);
  const c=vm.createContext({document:{body:{dataset:{mode:file.startsWith('guest-')?'guest':'member',page:file.includes('edit')?'edit':'post'},insertAdjacentHTML(){}},head:{append(){}},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],createElement:element},location:{href:url.href,origin:url.origin,pathname:url.pathname,search:url.search,replace:value=>redirects.push(value)},navigator:{},URL,URLSearchParams,FormData,Event,window:{addEventListener(){},print(){}},setTimeout:()=>0,clearTimeout(){},fetch:async(p,options={})=>{
    calls.push({p,options});
    const data=p==='/api/me'?{member}:p.startsWith('/api/posts/')?post:null;
    return {ok:!!data,status:data?200:404,json:async()=>data||{error:'삭제된 글입니다.'}};
  }});
  const run=code=>vm.runInContext(code,c);
  run(read('js/common.js'));run('safeRich=html=>html;');
  return {nodes,c,run,redirects,calls};
}
(async()=>{
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
    for(const [,ref] of read(file).matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,ref.split(/[?#]/)[0])),file+': '+ref);
  }
  for(const kind of ['cake','notice','request']){
    const post={id:'post-1',board:kind,title:'테스트',body:'내용',author:'삭제됨',created:'2026-01-01',updated:'2026-01-01',media:[{kind:'image',name:'사진',url:'/api/media/image-1'}],canEdit:false,canDelete:false};
    const guest=page('guest-post.html','?id=post-1',null,post);
    guest.run(read('js/detail.js'));await tick();
    assert.equal(guest.nodes.get('detailTitle').textContent,'테스트');
    assert.equal(guest.nodes.get('detailPage').hidden,false);
    assert.equal(guest.nodes.get('shareLink').value,'http://store.test/guest-post.html?id=post-1');
    assert.equal(guest.nodes.get('printControls').hidden,kind!=='cake');
    assert.equal(guest.nodes.get('largeText').checked,kind==='cake');
    assert.equal(guest.nodes.get('paperWidth').value,'80');
    assert.equal(guest.nodes.get('editPost').hidden,true);
    assert.equal(guest.calls[0].options.headers['X-TLJ-Guest'],'1');
    assert.equal(guest.run("mediaUrl('/api/media/image-1')"),'http://store.test/api/media/image-1?guest=1');
    await guest.nodes.get('copyPostLink').onclick();assert.equal(guest.nodes.get('sharePanel').hidden,false);assert.equal(guest.nodes.get('shareLink').selected,true);
  }
  const noLogin=page('post.html','?id=post-1');noLogin.run(read('js/detail.js'));await tick();
  assert.equal(noLogin.redirects[0],'login.html?next=post.html%3Fid%3Dpost-1');
  const missing=page('guest-post.html','?id=missing');missing.run(read('js/detail.js'));await tick();
  assert.equal(missing.nodes.get('detailPage').hidden,true);assert.match(missing.nodes.get('pageStatus').textContent,/삭제/);
  const auth=page('login.html','?next=post.html%3Fid%3Dpost-1');auth.run(read('js/auth.js'));await tick();
  assert.equal(auth.run('destination'),'post.html?id=post-1');assert.equal(auth.run("safeDestination('https://evil.test/post.html')"),'cake.html');
  assert.equal(auth.run("safeDestination('//evil.test/post.html')"),'cake.html');
  const user={id:'0123',name:'회원',permissions:{request:{read:true,write:true}}};
  const edit=page('edit.html','?board=request',user);
  // Canvas controls live in the one remaining image-editing dialog.
  for(const id of ['imageCanvas','rotateImage','resetImage','applyImage','imageDialog','penColor','penSize'])edit.nodes.set(id,{addEventListener(){}});
  edit.run(read('js/editor.js'));edit.run(read('js/editor-page.js'));await tick();
  assert.equal(edit.nodes.get('editorPage').hidden,false);
  edit.nodes.get('postTitle').value='요청';edit.nodes.get('plainBody').value='봉투';
  edit.run("api=async(path,options)=>path==='/api/me'?{member:{id:'0123',name:'회원'}}:path==='/api/posts'?{id:'saved-1'}:null;");
  await edit.nodes.get('postForm').onsubmit({preventDefault(){}});
  assert.equal(edit.redirects.at(-1),'post.html?id=saved-1');
  console.log('PASS standalone pages, guest sharing, clipboard fallback, login return, print defaults, missing posts and editor save navigation');
})().catch(error=>{console.error(error);process.exitCode=1});
