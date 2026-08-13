// BeaufTime — support photos + vidéos (bêta)
let selectedMediaType='image';

function injectVideoUI(){
  const preview=$('#preview');
  if(preview && !$('#previewVideo')) preview.insertAdjacentHTML('beforeend','<video id="previewVideo" hidden playsinline muted controls></video>');
  const buttons=$('.photo-buttons');
  if(buttons && !$('#videoPicker')){
    buttons.insertAdjacentHTML('beforeend','<label class="secondary video-pick">🎥 Vidéo<input id="videoPicker" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" capture="environment" hidden></label>');
  }
  if($('#gallery')) $('#gallery').setAttribute('accept','image/*,video/*');
  const hero=$('#postScreen .hero span');
  if(hero) hero.textContent='Photos illimitées · 2 vidéos maximum par jour · réactions uniquement.';
  const selected=$('#selectedChallenge');
  if(selected && !$('#videoQuota')) selected.insertAdjacentHTML('afterend','<div id="videoQuota" class="video-quota">🎥 Vidéos aujourd’hui : … / 2</div>');
  const st=document.createElement('style');
  st.textContent=`
    #previewVideo{width:100%;height:100%;object-fit:contain;background:#111}
    .post-card>video{width:100%;height:100%;object-fit:cover;background:#111}
    .video-quota{margin:10px 14px 0;padding:10px 12px;border-radius:14px;background:#eaf7fd;color:#245a74;font-weight:900;font-size:13px}
    .video-quota.full{background:#ffe0df;color:#8b2f2b}
    .video-pick{background:#fff0a6;color:#26465b}
    .video-sound{position:absolute;top:16px;right:16px;z-index:6;border:0;border-radius:999px;padding:9px 11px;background:#0008;color:#fff;font-weight:900}
    .media-badge{display:inline-block;background:#152f43cc;color:#fff;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900;margin-bottom:7px}
    .grid video,.profile-page-grid video,.user-detail-grid video{width:100%;aspect-ratio:1/1;object-fit:cover;background:#111}
  `;
  document.head.appendChild(st);
}
injectVideoUI();

function localDayBounds(){
  const n=new Date();
  const start=new Date(n.getFullYear(),n.getMonth(),n.getDate(),0,0,0,0);
  const end=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1,0,0,0,0);
  return [start.toISOString(),end.toISOString()];
}
async function getTodayVideoCount(){
  if(!user) return 0;
  const [start,end]=localDayBounds();
  const {count,error}=await db.from('posts').select('*',{count:'exact',head:true}).eq('user_id',user.id).eq('media_type','video').gte('created_at',start).lt('created_at',end);
  if(error){console.error('video quota',error);return 0}
  return count||0;
}
async function refreshVideoQuota(){
  const n=await getTodayVideoCount(), box=$('#videoQuota');
  if(box){box.textContent=`🎥 Vidéos aujourd’hui : ${n} / 2`;box.classList.toggle('full',n>=2)}
  return n;
}

function resetMediaPreview(){
  const img=$('#previewImg'),vid=$('#previewVideo');
  if(img){img.hidden=true;img.removeAttribute('src')}
  if(vid){vid.pause();vid.hidden=true;vid.removeAttribute('src');vid.load()}
  if($('#preview>span')) $('#preview>span').hidden=false;
  if($('#preview>b')) $('#preview>b').hidden=false;
}
async function chooseMedia(file){
  if(!file)return;
  const isVideo=file.type.startsWith('video/');
  if(isVideo){
    const n=await refreshVideoQuota();
    if(n>=2){toast('🎥 Limite atteinte : 2 vidéos par jour');return}
    if(file.size>50*1024*1024){toast('Vidéo trop lourde : 50 Mo maximum');return}
    selectedMediaType='video';
  }else{
    selectedMediaType='image';
  }
  photoFile=file;
  const url=URL.createObjectURL(file),img=$('#previewImg'),vid=$('#previewVideo');
  if($('#preview>span')) $('#preview>span').hidden=true;
  if($('#preview>b')) $('#preview>b').hidden=true;
  if(isVideo){
    if(img) img.hidden=true;
    vid.src=url;vid.hidden=false;vid.muted=false;vid.controls=true;vid.play().catch(()=>{});
  }else{
    if(vid){vid.pause();vid.hidden=true}
    img.src=url;img.hidden=false;
  }
  $('#publish').disabled=false;
}
if($('#camera')) $('#camera').onchange=e=>chooseMedia(e.target.files[0]);
if($('#gallery')) $('#gallery').onchange=e=>chooseMedia(e.target.files[0]);
if($('#videoPicker')) $('#videoPicker').onchange=e=>chooseMedia(e.target.files[0]);

// Feed compatible photos + vidéos.
loadFeed=async function(){
  const feed=$('#feed');feed.innerHTML='<div class="empty"><h2>Chargement du feed…</h2></div>';
  let q=db.from('posts').select('id,user_id,image_url,caption,challenge_id,created_at,media_type').order('created_at',{ascending:false}).limit(80);
  if(feedMode==='challenge')q=q.not('challenge_id','is',null);
  const {data:posts,error}=await q;
  if(error){feed.innerHTML=`<div class="empty"><h2>Erreur du feed</h2><p>${esc(error.message)}</p></div>`;return}
  let rows=posts||[];
  if(feedMode==='friends'){
    const {data:f}=await db.from('friendships').select('requester_id,addressee_id,status').eq('status','accepted').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const ids=new Set((f||[]).flatMap(x=>[x.requester_id,x.addressee_id]));ids.add(user.id);rows=rows.filter(x=>ids.has(x.user_id));
  }
  if(!rows.length)return renderFeed([]);
  const userIds=[...new Set(rows.map(x=>x.user_id))],challengeIds=[...new Set(rows.map(x=>x.challenge_id).filter(Boolean))],postIds=rows.map(x=>x.id);
  const [{data:ps},{data:cs},{data:rs}]=await Promise.all([
    db.from('profiles').select('id,username,avatar_url').in('id',userIds),
    challengeIds.length?db.from('challenges').select('id,title').in('id',challengeIds):Promise.resolve({data:[]}),
    db.from('reactions').select('post_id,user_id,reaction').in('post_id',postIds)
  ]);
  const pm=new Map((ps||[]).map(x=>[x.id,x])),cm=new Map((cs||[]).map(x=>[x.id,x])),rm=new Map();
  for(const r of rs||[]){if(!rm.has(r.post_id))rm.set(r.post_id,[]);rm.get(r.post_id).push(r)}
  renderFeed(rows.map(p=>({...p,profile:pm.get(p.user_id),challenge:cm.get(p.challenge_id),reactions:rm.get(p.id)||[]})));
};

renderFeed=function(rows){
  if(!rows.length){$('#feed').innerHTML='<div class="empty"><h2>Pas encore de BeaufTime ☀️</h2></div>';return}
  $('#feed').innerHTML=rows.map(p=>{
    const c={beer:0,boar:0,masterclass:0,flipflop:0};let mine='';for(const r of p.reactions){c[r.reaction]++;if(r.user_id===user.id)mine=r.reaction}
    const media=p.media_type==='video'
      ? `<video src="${esc(p.image_url)}" playsinline muted loop autoplay preload="metadata"></video><button class="video-sound" data-video-sound>🔇</button>`
      : `<img src="${esc(p.image_url)}" alt="BeaufTime">`;
    return `<article class="post-card" data-card="${p.id}">${media}<div class="shade"></div><div class="post-info">${p.media_type==='video'?'<span class="media-badge">🎥 VIDÉO</span>':''}<div class="userline" data-user-profile="${p.user_id}">${avatarHTML(p.profile,'uavatar')}<b>${esc(p.profile?.username||'Beauf')}</b></div>${p.challenge_id?`<span class="challenge-tag">🎯 ${esc(p.challenge?.title||'Défi')}</span>`:''}${p.caption?`<div class="caption">${esc(p.caption)}</div>`:''}<div class="reactions">${Object.entries(reactionLabels).map(([k,l])=>`<button class="react ${mine===k?'mine':''}" data-post="${p.id}" data-reaction="${k}">${l} <span>${c[k]}</span></button>`).join('')}</div></div></article>`;
  }).join('');
  $$('.react').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleReaction(b.dataset.post,b.dataset.reaction)});
  $$('[data-user-profile]').forEach(x=>x.onclick=()=>openUserProfile(x.dataset.userProfile));
  $$('[data-video-sound]').forEach(b=>b.onclick=e=>{e.stopPropagation();const v=b.parentElement.querySelector('video');v.muted=!v.muted;b.textContent=v.muted?'🔇':'🔊';if(v.paused)v.play().catch(()=>{})});
};

$('#publish').onclick=async()=>{
  if(!photoFile)return;
  if(selectedMediaType==='video' && await getTodayVideoCount()>=2){toast('🎥 Tu as déjà publié 2 vidéos aujourd’hui');$('#publish').disabled=false;return}
  $('#publish').disabled=true;$('#uploadMsg').textContent=selectedMediaType==='video'?'Envoi de la vidéo…':'Envoi…';
  const ext=(photoFile.name.split('.').pop()||(selectedMediaType==='video'?'mp4':'jpg')).toLowerCase();
  const path=`${user.id}/${selectedMediaType}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const up=await db.storage.from('beauftime-photos').upload(path,photoFile,{cacheControl:'3600',contentType:photoFile.type});
  if(up.error){$('#uploadMsg').textContent=up.error.message;$('#publish').disabled=false;return}
  const {data:pub}=db.storage.from('beauftime-photos').getPublicUrl(path);
  const {data:p,error}=await db.from('posts').insert({user_id:user.id,image_url:pub.publicUrl,caption:$('#caption').value.trim()||null,challenge_id:chosenChallenge?.id||null,media_type:selectedMediaType}).select('id').single();
  if(error){$('#uploadMsg').textContent=error.message;$('#publish').disabled=false;return}
  if(chosenChallenge)await db.rpc('complete_challenge',{p_challenge_id:chosenChallenge.id,p_post_id:p.id});
  photoFile=null;chosenChallenge=null;selectedMediaType='image';$('#selectedChallenge').hidden=true;resetMediaPreview();$('#caption').value='';$('#uploadMsg').textContent='';
  await Promise.all([loadProfile(),loadFeed(),loadRanking(),loadMyPosts(),refreshVideoQuota()]);go('feedScreen');toast(p.media_type==='video'?'🎥 Vidéo publiée !':'☀️ BeaufTime publié !');
};

loadMyPosts=async function(){
  const {data}=await db.from('posts').select('image_url,media_type').eq('user_id',user.id).order('created_at',{ascending:false});
  $('#postsCount').textContent=(data||[]).length;
  $('#myGrid').innerHTML=(data||[]).map(p=>p.media_type==='video'?`<video src="${esc(p.image_url)}" muted playsinline preload="metadata"></video>`:`<img src="${esc(p.image_url)}">`).join('');
};

// Actualise le quota à l'ouverture de la page Poster.
const oldGo=go;
go=function(id,scroll=true){oldGo(id,scroll);if(id==='postScreen')refreshVideoQuota()};
$$('.nav').forEach(n=>n.onclick=()=>go(n.dataset.screen));

refreshVideoQuota();
