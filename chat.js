// BeaufTime chat + notifications V6
let currentChatUser=null,chatPoll=null;

function injectChatUI(){
  const actions=$('header .header-actions');
  if(actions&&!$('#chatBtn')) actions.insertAdjacentHTML('afterbegin','<button id="chatBtn" class="round chat-head-btn" title="Messages">💬<span id="chatBadge" class="notif-badge" hidden>0</span></button>');
  const main=$('main');
  if(main&&!$('#chatScreen')) main.insertAdjacentHTML('beforeend',`
    <section id="chatScreen" class="screen">
      <div class="page-head"><button class="page-back">←</button><h1>Messages</h1><span></span></div>
      <div class="chat-hero"><b>💬 Tchat entre potes</b><span>Tu peux écrire uniquement à tes amis.</span></div>
      <div id="chatContacts" class="chat-contacts"></div>
    </section>
    <section id="conversationScreen" class="screen conversation-screen">
      <div class="chat-top"><button id="chatBack" class="page-back">←</button><div id="chatPerson" class="chat-person"></div></div>
      <div id="chatMessages" class="chat-messages"></div>
      <form id="chatForm" class="chat-compose"><input id="chatInput" maxlength="2000" autocomplete="off" placeholder="Écris un message…"><button class="primary" type="submit">➤</button></form>
    </section>`);
  const st=document.createElement('style');
  st.textContent=`
  .chat-head-btn{position:relative}.chat-hero{padding:18px;background:linear-gradient(135deg,#fff1a8,#bcecff);display:grid;gap:4px}.chat-hero b{font-size:22px}.chat-hero span{color:var(--muted)}
  .chat-contacts{padding:12px}.chat-contact{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:18px;padding:11px;margin:8px 0;cursor:pointer}.chat-contact .mini-avatar{width:50px;height:50px}.chat-preview{min-width:0}.chat-preview b{display:block}.chat-preview small{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:330px}.chat-time{font-size:11px;color:var(--muted);text-align:right}.chat-unread{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#ffd54a;color:#17384d;font-size:11px;font-weight:900;margin-top:4px}
  .conversation-screen{height:calc(100vh - 64px - 76px);position:relative;background:#f5fbfe}.chat-top{height:62px;background:#fff;display:grid;grid-template-columns:46px 1fr;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--line);position:sticky;top:64px;z-index:20}.chat-person{display:flex;align-items:center;gap:9px;font-weight:900}.chat-person .mini-avatar{width:40px;height:40px;font-size:20px}.chat-messages{height:calc(100% - 62px - 72px);overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:7px}.bubble{max-width:82%;padding:10px 13px;border-radius:18px;background:#fff;border:1px solid var(--line);align-self:flex-start;word-break:break-word}.bubble.mine{align-self:flex-end;background:#fff1a8;border-color:#f0d25c}.bubble small{display:block;font-size:10px;color:#718391;margin-top:4px;text-align:right}.chat-compose{height:72px;display:grid;grid-template-columns:1fr 54px;gap:8px;padding:9px 12px;background:#fff;border-top:1px solid var(--line);position:absolute;bottom:0;left:0;right:0}.chat-compose input{margin:0}.chat-compose button{padding:0;font-size:20px}.message-friend-btn{margin-left:8px;background:#dff5ff!important;color:#146188!important}.profile-page-actions{display:flex;gap:8px}.profile-page-actions .friend-btn,.profile-page-actions .message-friend-btn{flex:1}.notif-kind{font-size:18px}.request-quick{border:0;border-radius:10px;padding:7px 9px;background:#dff7e7;color:#24633c;font-weight:900}
  @media(max-width:699px){.conversation-screen{height:calc(100vh - 64px - 76px)}.chat-top{top:0}.chat-preview small{max-width:210px}}
  `;
  document.head.appendChild(st);
  $('#chatBtn').onclick=()=>{go('chatScreen');loadChatContacts()};
  $('#chatBack').onclick=()=>{stopChatPoll();go('chatScreen');loadChatContacts()};
  $('#chatForm').onsubmit=sendChatMessage;
  $$('#chatScreen .page-back').forEach(b=>b.onclick=()=>go('feedScreen'));
}
injectChatUI();

function fmtTime(d){try{return new Date(d).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}catch{return ''}}
function fmtDate(d){try{return new Date(d).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return ''}}

async function getAcceptedFriends(){
  if(!user)return [];
  const {data:rels,error}=await db.from('friendships').select('requester_id,addressee_id,status').eq('status','accepted').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  if(error){console.error(error);return []}
  const ids=[...new Set((rels||[]).map(f=>f.requester_id===user.id?f.addressee_id:f.requester_id))];
  if(!ids.length)return [];
  const {data:ps}=await db.from('profiles').select('id,username,avatar_url').in('id',ids);
  return ps||[];
}

async function getThread(otherId,limit=120){
  const {data,error}=await db.rpc('chat_thread',{p_other:otherId,p_limit:limit});
  if(error){console.error('chat_thread',error);return []}
  return data||[];
}

async function loadChatBadge(){
  if(!user)return;
  const {count}=await db.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',user.id).eq('type','message').eq('is_read',false);
  const n=count||0,b=$('#chatBadge');if(b){b.textContent=n>99?'99+':n;b.hidden=!n}
}

async function loadChatContacts(){
  if(!user||!$('#chatContacts'))return;
  const box=$('#chatContacts');box.innerHTML='<div class="empty">Chargement des conversations…</div>';
  const friends=await getAcceptedFriends();
  if(!friends.length){box.innerHTML='<div class="empty"><h2>Pas encore de conversation 💬</h2><p>Ajoute d’abord des amis dans la communauté.</p></div>';return}
  const {data:unread}=await db.from('notifications').select('actor_id').eq('user_id',user.id).eq('type','message').eq('is_read',false);
  const unreadMap={};for(const n of unread||[])unreadMap[n.actor_id]=(unreadMap[n.actor_id]||0)+1;
  const enriched=await Promise.all(friends.map(async p=>{const thread=await getThread(p.id,120);return {p,last:thread[thread.length-1],unread:unreadMap[p.id]||0}}));
  enriched.sort((a,b)=>new Date(b.last?.created_at||0)-new Date(a.last?.created_at||0));
  box.innerHTML=enriched.map(({p,last,unread})=>`<div class="chat-contact" data-chat="${p.id}">${avatarHTML(p)}<div class="chat-preview"><b>${esc(p.username)}</b><small>${last?esc(last.body):'Commencer la discussion…'}</small></div><div class="chat-time">${last?fmtTime(last.created_at):''}${unread?`<span class="chat-unread">${unread}</span>`:''}</div></div>`).join('');
  $$('[data-chat]').forEach(x=>x.onclick=()=>openConversation(x.dataset.chat));
}

async function openConversation(otherId){
  const f=await getFriendship(otherId);if(!f||f.status!=='accepted')return toast('Le tchat est réservé aux amis 🫂');
  const {data:p}=await db.from('profiles').select('id,username,avatar_url').eq('id',otherId).single();if(!p)return;
  currentChatUser=p;go('conversationScreen',false);$('#chatPerson').innerHTML=`${avatarHTML(p)}<span>${esc(p.username)}</span>`;
  await refreshConversation(true);startChatPoll();
}

async function refreshConversation(scroll=false){
  if(!currentChatUser)return;
  const thread=await getThread(currentChatUser.id,200),box=$('#chatMessages');
  box.innerHTML=thread.map(m=>`<div class="bubble ${m.sender_id===user.id?'mine':''}">${esc(m.body)}<small>${fmtTime(m.created_at)}</small></div>`).join('')||'<div class="empty">Envoie le premier message 👋</div>';
  await db.rpc('chat_mark_read',{p_other:currentChatUser.id});
  await db.from('notifications').update({is_read:true}).eq('user_id',user.id).eq('actor_id',currentChatUser.id).eq('type','message').eq('is_read',false);
  await Promise.all([loadChatBadge(),loadNotificationCount()]);
  if(scroll)box.scrollTop=box.scrollHeight;else if(box.scrollHeight-box.scrollTop-box.clientHeight<180)box.scrollTop=box.scrollHeight;
}

async function sendChatMessage(e){
  e.preventDefault();if(!currentChatUser)return;const input=$('#chatInput'),body=input.value.trim();if(!body)return;
  input.disabled=true;
  const {data,error}=await db.rpc('chat_send',{p_receiver:currentChatUser.id,p_body:body});
  if(error){input.disabled=false;return toast(error.message.includes('friends only')?'Vous devez être amis pour discuter.':error.message)}
  const row=Array.isArray(data)?data[0]:data;
  if(row?.id)await db.rpc('chat_notify',{p_receiver:currentChatUser.id,p_message:row.id});
  input.value='';input.disabled=false;input.focus();await refreshConversation(true);await loadChatContacts();
}

function startChatPoll(){stopChatPoll();chatPoll=setInterval(()=>{if(currentScreen==='conversationScreen')refreshConversation(false)},3500)}
function stopChatPoll(){if(chatPoll){clearInterval(chatPoll);chatPoll=null}}

function addMessageButtons(){
  $$('.user-row').forEach(async row=>{const id=row.dataset.openUser;if(!id||row.querySelector('.message-friend-btn'))return;const f=await getFriendship(id);if(f?.status==='accepted'){const b=document.createElement('button');b.className='friend-btn message-friend-btn';b.textContent='💬';b.title='Message';b.onclick=e=>{e.stopPropagation();openConversation(id)};row.appendChild(b)}});
  const actions=$('#userProfileContent .profile-page-actions');if(actions&&!actions.querySelector('.message-friend-btn')){const id=$('#userProfileContent [data-addfriend]')?.dataset.addfriend||window.__lastOpenedProfile;if(id)getFriendship(id).then(f=>{if(f?.status==='accepted'){const b=document.createElement('button');b.className='friend-btn message-friend-btn';b.textContent='💬 Message';b.onclick=()=>openConversation(id);actions.appendChild(b)}})}
}

const _loadCommunity=loadCommunity;loadCommunity=async function(){await _loadCommunity();setTimeout(addMessageButtons,0)};
const _openUserProfile=openUserProfile;openUserProfile=async function(id){window.__lastOpenedProfile=id;await _openUserProfile(id);setTimeout(addMessageButtons,0)};

loadNotificationCount=async function(){
  if(!user)return;
  const {count}=await db.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',user.id).eq('is_read',false);
  const n=count||0,b=$('#notifBadge');if(b){b.textContent=n>99?'99+':n;b.hidden=!n}
  if(n>lastNotifCount&&lastNotifCount>0){const {data:last}=await db.from('notifications').select('type').eq('user_id',user.id).eq('is_read',false).order('created_at',{ascending:false}).limit(1).maybeSingle();toast(last?.type==='message'?'💬 Nouveau message !':last?.type==='friend_request'?'👥 Nouvelle demande d’ami !':'🔔 Nouvelle réaction !')}
  lastNotifCount=n;await loadChatBadge();
};

loadNotifications=async function(){
  const box=$('#notificationsList');box.innerHTML='<div class="empty">Chargement…</div>';
  const {data:notifs,error}=await db.from('notifications').select('id,actor_id,post_id,reaction,type,message_id,friendship_id,is_read,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
  if(error)return box.innerHTML=`<div class="empty">${esc(error.message)}</div>`;
  if(!(notifs||[]).length)return box.innerHTML='<div class="empty"><h2>Aucune notification 🔔</h2></div>';
  const actors=[...new Set(notifs.map(x=>x.actor_id))],posts=[...new Set(notifs.map(x=>x.post_id).filter(Boolean))];
  const [{data:ps},{data:po}]=await Promise.all([db.from('profiles').select('id,username,avatar_url').in('id',actors),posts.length?db.from('posts').select('id,image_url').in('id',posts):Promise.resolve({data:[]})]);
  const pm=new Map((ps||[]).map(x=>[x.id,x])),pom=new Map((po||[]).map(x=>[x.id,x]));
  box.innerHTML=notifs.map(n=>{const p=pm.get(n.actor_id),post=pom.get(n.post_id),d=fmtDate(n.created_at);let title='',kind='🔔';if(n.type==='message'){kind='💬';title=`${esc(p?.username||'Un Beauf')} t’a envoyé un message`;}else if(n.type==='friend_request'){kind='👥';title=`${esc(p?.username||'Un Beauf')} veut devenir ton ami`;}else{kind=reactionEmoji[n.reaction]||'🍺';title=`${esc(p?.username||'Un Beauf')} a réagi ${kind}`;}return `<div class="notif-row ${n.is_read?'':'unread'}" data-notif="${n.id}" data-type="${n.type}" data-actor="${n.actor_id}">${avatarHTML(p)}<div class="notif-text"><b><span class="notif-kind">${kind}</span> ${title}</b><small>${d}</small></div>${post?`<img class="notif-thumb" src="${esc(post.image_url)}">`:''}</div>`}).join('');
  $$('[data-notif]').forEach(r=>r.onclick=async()=>{await db.from('notifications').update({is_read:true}).eq('id',r.dataset.notif);await loadNotificationCount();if(r.dataset.type==='message')openConversation(r.dataset.actor);else if(r.dataset.type==='friend_request'){go('communityScreen');loadCommunity()}else openUserProfile(r.dataset.actor)});
};

// Polling léger pour la bêta : badges et notifications restent à jour entre deux téléphones.
setInterval(()=>{if(user){loadNotificationCount();if(currentScreen==='chatScreen')loadChatContacts()}},5000);
window.addEventListener('focus',()=>{if(user){loadNotificationCount();if(currentScreen==='chatScreen')loadChatContacts();if(currentScreen==='conversationScreen')refreshConversation(true)}});
