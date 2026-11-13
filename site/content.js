/* Text-only publication patches. No HTML supplied by an editor is executed. */
(() => {
 'use strict';
 const endpoint='https://ksvwaaafumiuinfhtrkv.supabase.co';
 const key='sb_publishable_v_cStkNfd6Xpq7VglDQHcw_wsxu4hxr';
 const PUBLICATION_ENABLED=true;
 const client=window.Canopee?.client || window.supabase?.createClient(endpoint,key);
 function setTitle(row){
  if(typeof row.content?.title!=='string')return;
  const href='/documents/'+row.resource_id+'/';
  for(const a of document.querySelectorAll('a[href]')) if(a.getAttribute('href')===href){const span=a.querySelector('span');(span||a).textContent=row.content.title;if(row.state==='paused')a.append(' · En cours de révision')}
 }
 async function apply(row){
  const article=document.querySelector('article.lesson-content');if(!article)return;
  if(row.state==='paused'){
   article.replaceChildren();const message=document.createElement('p');message.className='content-notice';message.textContent='Cette fiche est en cours de révision. Les autres ressources du chapitre restent disponibles.';article.append(message);return;
  }
  if(row.content.title){document.querySelector('h1').textContent=row.content.title;document.title=row.content.title+' · Canopée'}
  for(const node of article.querySelectorAll('[data-cms-block]')){const text=row.content.texts?.[node.dataset.cmsBlock];if(typeof text==='string')node.textContent=text}
  if(row.content.attachments?.length){
   const section=document.createElement('section');section.className='published-attachments';const title=document.createElement('h2');title.textContent='Documents complémentaires';section.append(title);
   for(const file of row.content.attachments){
    if(!file.path?.startsWith(row.resource_id+'/'))continue;
    const {data,error}=await client.storage.from('canopee-resources').createSignedUrl(file.path,3600);
    if(error||!data?.signedUrl){const p=document.createElement('p');p.textContent=file.name+' : document momentanément indisponible.';section.append(p);continue}
    const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener';link.textContent=file.name+' ↗';section.append(link);
    if(file.mime?.startsWith('image/')){const image=document.createElement('img');image.src=data.signedUrl;image.alt=file.name;image.loading='lazy';section.append(image)}
    if(file.mime==='application/pdf'){const host=document.createElement('div');host.className='pdf-reader';host.dataset.pdf=data.signedUrl;section.append(host);const {mountPDF}=await import('/pdf-reader.js');mountPDF(host)}
   }
   article.append(section);
  }
 }
 // Only same-origin administration may request a draft preview; it must first pass RLS.
 const params=new URLSearchParams(location.search),rid=document.body.dataset.resource;
 async function boot(){
  if(!client)return;
  await window.Canopee?.ready;
  if(params.has('apercu')&&rid){
   const {data,error}=await client.from('canopee_editors').select('user_id').eq('user_id',window.Canopee?.user?.id||'00000000-0000-0000-0000-000000000000').maybeSingle();
   if(!error&&data){
    const notice=document.createElement('p');notice.className='content-notice';notice.textContent='Aperçu privé du brouillon · aucune modification des réponses élèves';document.querySelector('main')?.prepend(notice);
    const draft=await client.from('canopee_resource_drafts').select('content,resource_id').eq('resource_id',rid).maybeSingle();
    if(draft.error)throw draft.error;if(draft.data)await apply({...draft.data,state:'published'});return;
   }
  }
  if(!PUBLICATION_ENABLED)return;
  const {resourceVisibility}=await import('/new-public.js');
  const hidden=await resourceVisibility();
  const resourcePath=new URL('/documents/',location.origin).pathname;
  for(const link of document.querySelectorAll('a[href]')){
   if(link.origin!==location.origin||!link.pathname.startsWith(resourcePath))continue;
   const id=link.pathname.slice(resourcePath.length).split('/')[0];
   if(hidden.has(id))link.remove();
  }
  if(hidden.has(rid)){
   const article=document.querySelector('article.lesson-content')||document.querySelector('main');
   const heading=document.querySelector('h1');
   if(heading)heading.textContent='Fiche retirée';
   document.title='Fiche retirée · Canopée';
   if(article){
    const message=document.createElement('p');
    message.className='content-notice';
    message.textContent='Cette fiche n’est plus disponible dans la bibliothèque.';
    article.replaceChildren(message);
   }
   const robots=document.createElement('meta');
   robots.name='robots';robots.content='noindex';document.head.append(robots);
   return;
  }
  const {data,error}=await client.from('canopee_resource_publications').select('resource_id,content,state,revision,updated_at');
  if(error)return; // An unavailable CMS never prevents reading the original static lesson.
  for(const row of data||[]){if(row.state!=='published'||hidden.has(row.resource_id))continue;setTitle(row);if(row.resource_id===rid)await apply(row)}
 }
 window.CanopeeContent={apply};boot().catch(()=>{});
 if(window.Canopee)window.Canopee.ready.then(async()=>{
  if(!window.Canopee.user)return;
  const {data}=await client.from('canopee_editors').select('user_id').eq('user_id',window.Canopee.user.id).maybeSingle();if(!data)return;
  const target=document.querySelector('.lesson-toolbar, .toolbar, .account-page header, header');if(!target)return;
  const link=document.createElement('a');link.href='/administration/'+(rid?'#'+encodeURIComponent(rid):'');link.className='admin-entry';link.textContent='Administrer les ressources';target.append(link);
 });
})();

import("/new-public.js").catch(()=>{});
