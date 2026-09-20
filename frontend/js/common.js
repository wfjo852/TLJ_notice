'use strict';
const $ = id => document.getElementById(id);
const guestMode=document.body.dataset.mode==='guest';
const boards = {cake:['케이크 생산','내일의 생산 목록을 확인하고 준비해 주세요.'],notice:['공지사항','매장에 필요한 소식과 안내를 함께 나눠요.'],request:['필요 물품 요청','필요한 물품을 누구나 편하게 요청하세요.']};
let db, board='cake', page=1, member=null, members=[], posts=[], editing=null, viewing=null, media=[], draftQueue=Promise.resolve(), editorOpen=false, mediaBusy=false;
let objectUrls=[], imageIndex=0, originalImage=null, drawing=false;
const uid=()=>crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const date=d=>new Date(d).toLocaleString('ko-KR');
const shortDate=d=>new Date(d).toLocaleDateString('ko-KR');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function store(name, mode, operation){return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode);const req=operation(tx.objectStore(name));let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('저장 취소'));});}
const all=name=>store(name,'readonly',s=>s.getAll());
const put=(name,value)=>store(name,'readwrite',s=>s.put(value));
const get=(name,id)=>store(name,'readonly',s=>s.get(id));
const del=(name,id)=>store(name,'readwrite',s=>s.delete(id));
function safeRich(html){const source=new DOMParser().parseFromString(html,'text/html');const allowed=new Set(['B','STRONG','I','EM','U','P','DIV','BR','UL','OL','LI']);function clean(node){if(node.nodeType===3)return document.createTextNode(node.textContent);const out=document.createDocumentFragment();if(node.nodeType!==1)return out;if(['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName))return out;const target=allowed.has(node.tagName)?document.createElement(node.tagName):out;for(const child of node.childNodes)target.append(clean(child));return target;}const holder=document.createElement('div');for(const node of source.body.childNodes)holder.append(clean(node));return holder.innerHTML;}
function textOf(html){const element=document.createElement('div');element.innerHTML=safeRich(html);return element.textContent;}
function tomorrowTitle(){const d=new Date();d.setDate(d.getDate()+1);return `[${String(d.getFullYear()).slice(-2)}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}] 생산목록`;}
function currentMember(){return members.find(m=>m.id===member);}
function defaultPermissions(){return Object.fromEntries(Object.keys(boards).map(key=>[key,{read:true,write:key==='request',edit:key==='request',delete:key==='request'}]));}
function permissionsFor(user){const defaults=defaultPermissions();for(const key of Object.keys(defaults))for(const action of Object.keys(defaults[key])){const value=user?.permissions?.[key]?.[action];if(typeof value==='boolean')defaults[key][action]=value;}return defaults;}
function hasPermission(key,action){return !!currentMember()&&permissionsFor(currentMember())[key]?.[action]===true;}
function isUserAdmin(){return !guestMode&&member==='0026'&&!!currentMember();}
function canRead(key=board){return guestMode||hasPermission(key,'read');}
function canWrite(){return guestMode?board==='request':hasPermission(board,'write');}
function canEdit(post){return guestMode?post.board==='request'&&!post.member&&post.owner===guestOwner():hasPermission(post.board,'edit');}
function canDelete(post){return guestMode?post.board==='request'&&!post.member&&post.owner===guestOwner():hasPermission(post.board,'delete');}
async function refreshIdentity(){if(guestMode){member=null;return;}const id=sessionStorage.getItem('tlj-session');const user=id?await get('members',id):null;member=user?.id||null;if(user)members=[...members.filter(item=>item.id!==id),user];}
function guestOwner(){let id=localStorage.getItem('tlj-guest');if(!id){id=uid();localStorage.setItem('tlj-guest',id);}return id;}
async function initializeStore(){db=await new Promise((resolve,reject)=>{const req=indexedDB.open('tlj-notice',1);req.onupgradeneeded=()=>{for(const name of ['posts','members','drafts'])req.result.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});members=await all('members');member=guestMode?null:sessionStorage.getItem('tlj-session')||null;if(!currentMember())member=null;}
function logout(){sessionStorage.removeItem('tlj-session');location.replace('login.html');}
