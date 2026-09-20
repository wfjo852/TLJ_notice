window.addEventListener('tlj:ready',async()=>{
const results=[];const check=(ok,label)=>{results.push((ok?'PASS ':'FAIL ')+label);if(!ok)throw Error(label);};
try{
if(!guestMode){
check(!$('loginScreen').hidden&&$('appShell').hidden,'default login gate');
board='request';await openEditor();check(!editorOpen,'anonymous request blocked on member URL');
$('memberCode').value='0123';$('memberName').value='테스트';await authenticate('login');check(!member&&!!$('loginError').textContent,'unregistered login rejected');
$('memberName').value='';await authenticate('register');check(!member,'registration requires name');$('memberName').value='테스트';await authenticate('register');check(member==='0123'&&!$('appShell').hidden,'registration and leading zero');
board='cake';await openEditor();$('plainBody').value='케이크 12개';await queueDraft();await closeEditor();await openEditor();check($('plainBody').value==='케이크 12개','draft restoration');await closeEditor();
logout();check($('appShell').hidden&&!sessionStorage.getItem('tlj-session'),'logout clears session');
$('memberCode').value='9999';$('memberName').value='';await authenticate('login');check(!member,'unknown number rejected');
$('memberCode').value='0123';$('memberName').value='';await authenticate('login');check(member==='0123'&&sessionStorage.getItem('tlj-session')==='0123','login stores tab session');
check(!canEdit({member:'9999'}),'other member edit rejected');
}else{
check(!member&&canRead()&&!$('appShell').hidden,'guest URL opens without login');check(board==='request','guest landing is requests');
board='cake';render();await openEditor();check($('newPost').hidden&&!editorOpen,'guest cake write blocked');
board='notice';render();check($('newPost').hidden,'guest notice write blocked');
board='request';render();await openEditor();check(editorOpen,'guest request editor allowed');$('postTitle').value='봉투';$('plainBody').value='100장';$('postForm').dispatchEvent(new Event('submit',{cancelable:true}));for(let i=0;i<100&&editorOpen;i++)await new Promise(r=>setTimeout(r,20));
const saved=(await all('posts')).find(p=>p.title==='봉투');check(saved&&!saved.member&&saved.author==='비회원','guest request saved anonymously');check(canEdit(saved),'own guest request editable');check(!canEdit({...saved,member:'0123'}),'member edit blocked in guest mode');
}
}catch(error){results.push('ERROR '+error.message);}
const output=document.createElement('pre');output.id='test-results';output.textContent=results.join('\n');document.body.prepend(output);
});
