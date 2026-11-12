(() => {
 'use strict';
 const $=s=>document.querySelector(s),api=window.Canopee,client=api.client;
 // Public read rules approved by the owner; drafts remain restricted by RLS.
 const PUBLICATION_ENABLED=true;
 let resources=[],selected=null,draft=null,publication=null,payload=null,dirty=false,busy=false,authorized=false,epoch=0;
 const status=t=>$('#editor-feedback').textContent=t;
 const copy=v=>JSON.parse(JSON.stringify(v));
 function baseline(r){return {title:r.title,texts:Object.fromEntries(r.blocks.map(b=>[b.id,b.text])),attachments:[]}}
 function changed(){dirty=true;$('#draft-state').textContent='Modifications non enregistrées'}
 function lock(value){busy=value;for(const b of $('#edit-form').querySelectorAll('button,input,textarea'))b.disabled=value;$('#publish').disabled=value||!PUBLICATION_ENABLED;$('#pause').disabled=value||!PUBLICATION_ENABLED}
 function attachmentList(){
  const list=$('#attachments-list');list.replaceChildren();
  payload.attachments.forEach((file,index)=>{const li=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name;remove.type='button';remove.textContent='Retirer du brouillon';remove.onclick=()=>{payload.attachments.splice(index,1);attachmentList();changed()};li.append(name,remove);list.append(li)});
 }
 function form(){
  $('#empty-editor').hidden=true;$('#edit-form').hidden=false;$('#resource-title').value=payload.title;
  $('#resource-kind').textContent=['ACTIVITÉ / TP','COURS / SUPPORT','COMPLÉMENT'][selected.type]+' · '+levels[selected.level]+' · '+selected.chapter;
  $('#original-link').href=selected.url;$('#draft-state').textContent=draft?'Brouillon enregistré · version '+draft.revision:'Version initiale · aucun brouillon enregistré';
  const host=$('#text-blocks');host.replaceChildren();
  for(const [index,block] of selected.blocks.entries()){
   const wrap=document.createElement('div');wrap.className='block-editor';const label=document.createElement('label'),input=document.createElement('textarea');
   input.id='edit-'+block.id;input.dataset.block=block.id;input.maxLength=50000;input.value=payload.texts[block.id]??block.text;input.rows=Math.min(12,Math.max(2,Math.ceil(input.value.length/85)));label.htmlFor=input.id;label.textContent='Passage '+(index+1);input.oninput=()=>{payload.texts[block.id]=input.value;changed()};wrap.append(label,input);host.append(wrap);
  }
  if(!selected.blocks.length){const p=document.createElement('p');p.textContent='Ce support ne contient pas de texte web modifiable. Vous pouvez modifier son titre et ajouter des documents complémentaires.';host.append(p)}
  $('#block-search').value='';attachmentList();lock(false);status('');
 }
 const levels=['Seconde · SVT','Première spécialité · SVT','Terminale spécialité · SVT','Première · Enseignement scientifique','Terminale · Enseignement scientifique'];
 function filterChapters(){const chosen=$('#chapter-filter').value,level=$('#level-filter').value;$('#chapter-filter').replaceChildren(new Option('Tous les chapitres',''));const seen=new Set();for(const r of resources.filter(r=>level===''||String(r.level)===level)){if(seen.has(r.chapter_id))continue;seen.add(r.chapter_id);$('#chapter-filter').add(new Option((level===''?levels[r.level]+' · ':'')+r.chapter,r.chapter_id))}if([...$('#chapter-filter').options].some(o=>o.value===chosen))$('#chapter-filter').value=chosen;list()}
 function list(){const search=$('#resource-search').value.toLocaleLowerCase('fr'),level=$('#level-filter').value,chapter=$('#chapter-filter').value;const visible=resources.filter(r=>(level===''||String(r.level)===level)&&(!chapter||r.chapter_id===chapter)&&(r.title+' '+r.theme+' '+r.chapter).toLocaleLowerCase('fr').includes(search));$('#resource-count').textContent=visible.length+' ressource(s) sur '+resources.length;$('#resource-list').replaceChildren();for(const r of visible){const b=document.createElement('button');b.type='button';const title=document.createElement('span'),context=document.createElement('small');title.textContent=r.title;context.textContent=levels[r.level]+' · '+r.chapter;b.append(title,context);b.setAttribute('aria-current',String(selected?.id===r.id));b.onclick=()=>open(r);$('#resource-list').append(b)}if(!visible.length){const p=document.createElement('p');p.textContent='Aucune ressource pour ces critères.';$('#resource-list').append(p)}}
 async function run(work){if(busy||!authorized)return;const generation=epoch;lock(true);try{await work(generation)}catch(error){if(generation!==epoch)return;status(error.code==='40001'?'Cette fiche a changé dans un autre onglet. Vos modifications sont conservées à l’écran : copiez-les, puis rechargez la fiche.':error.message||'Opération impossible. Vérifiez votre connexion ; vos modifications restent à l’écran.')}finally{if(generation===epoch&&authorized)lock(false)}}
 async function open(r){
  if(r.created){if(dirty&&!confirm('Quitter sans enregistrer ?'))return;location.assign('/administration/creation/?id='+encodeURIComponent(r.id));return}
  if(busy)return;if(dirty&&!confirm('Quitter cette fiche sans enregistrer les modifications ?'))return;
  await run(async generation=>{
   const [d,p]=await Promise.all([client.from('canopee_resource_drafts').select('resource_id,content,revision,updated_at').eq('resource_id',r.id).maybeSingle(),client.from('canopee_resource_publications').select('resource_id,content,state,revision,updated_at').eq('resource_id',r.id).maybeSingle()]);
   if(generation!==epoch)return;if(d.error)throw d.error;if(p.error)throw p.error;
   selected=r;draft=d.data;publication=p.data;payload=copy(draft?.content||publication?.content||baseline(r));dirty=false;form();list();history.replaceState(null,'','#'+encodeURIComponent(r.id));
  });
 }
 async function save(generation){
  payload.title=$('#resource-title').value.trim();if(!payload.title)throw Error('Saisissez un titre.');
  const {data,error}=await client.rpc('canopee_save_draft',{rid:selected.id,payload,expected_revision:draft?.revision||0});if(error)throw error;if(generation!==epoch)return false;
  draft={resource_id:selected.id,content:copy(payload),revision:data};dirty=false;$('#draft-state').textContent='Brouillon enregistré · version '+data;status('Brouillon enregistré. La fiche visible des élèves reste inchangée.');return true;
 }
 $('#edit-form').onsubmit=e=>{e.preventDefault();run(save)};
 $('#resource-title').oninput=()=>{if(payload){payload.title=$('#resource-title').value;changed()}};
 $('#duplicate').onclick=()=>{if(!selected)return;if(dirty){status('Enregistrez le brouillon avant de dupliquer.');return}location.assign('/administration/creation/?dupliquer='+encodeURIComponent(selected.id))};
 $('#resource-search').oninput=list;$('#level-filter').onchange=filterChapters;$('#chapter-filter').onchange=list;
 $('#block-search').oninput=()=>{const term=$('#block-search').value.toLocaleLowerCase('fr');for(const node of $('#text-blocks').children)node.hidden=!node.textContent.toLocaleLowerCase('fr').includes(term)&&!node.querySelector('textarea')?.value.toLocaleLowerCase('fr').includes(term)};
 $('#preview').onclick=()=>run(async generation=>{if(dirty||!draft){if(!await save(generation))return}if(generation===epoch){const a=document.createElement('a');a.href=selected.url+'?apercu=brouillon';a.target='_blank';a.rel='noopener';a.click();status('Aperçu du brouillon enregistré ouvert.')}});
 $('#upload').onchange=()=>run(async generation=>{
  const file=$('#upload').files[0];if(!file)return;if(payload.attachments.length>=10)throw Error('Dix pièces jointes maximum.');
  const formats={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  if(!formats[file.type]||file.size>10485760)throw Error('Choisissez un PDF, PNG, JPEG ou WebP de 10 Mo maximum.');
  const path=selected.id+'/'+crypto.randomUUID()+'.'+formats[file.type];
  const {error}=await client.storage.from('canopee-resources').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;if(generation!==epoch)return;
  payload.attachments.push({path,name:file.name.slice(0,200),mime:file.type});$('#upload').value='';attachmentList();changed();status('Document ajouté au brouillon. Enregistrez pour le conserver avec cette fiche.');
 });
 let nextState='published';
 function confirmPublish(state){if(!PUBLICATION_ENABLED){status('La publication publique doit encore être activée. Vous pouvez préparer et prévisualiser votre brouillon.');return}nextState=state;$('#publication-confirm h2').textContent=state==='paused'?'Mettre la fiche en pause ?':'Publier cette version ?';$('#publication-confirm').showModal()}
 $('#publish').onclick=()=>confirmPublish('published');$('#pause').onclick=()=>confirmPublish('paused');$('#cancel-publication').onclick=()=>$('#publication-confirm').close();
 $('#confirm-publication').onclick=()=>{$('#publication-confirm').close();run(async generation=>{if(dirty||!draft){if(!await save(generation))return}const {data,error}=await client.rpc('canopee_publish_resource',{rid:selected.id,draft_revision:draft.revision,expected_publication:publication?.revision||0,new_state:nextState});if(error)throw error;if(generation!==epoch)return;publication={revision:data,content:copy(payload),state:nextState};status(nextState==='paused'?'La fiche est en pause.':'Le brouillon est publié.');})};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 async function access(){
  const generation=++epoch;authorized=false;$('#workspace').hidden=true;$('#access').hidden=false;$('#edit-form').hidden=true;selected=null;payload=null;dirty=false;$('#text-blocks').replaceChildren();$('#attachments-list').replaceChildren();$('#resource-title').value='';$('#resource-list').replaceChildren();
  await api.ready;if(generation!==epoch)return;
  if(!api.user){$('#access-status').textContent='Connectez-vous avec le compte enseignant autorisé. Si votre compte n’est pas encore créé, terminez d’abord l’inscription et la confirmation de votre adresse.';return}
  const {data,error}=await client.from('canopee_editors').select('user_id').eq('user_id',api.user.id).maybeSingle();if(generation!==epoch)return;
  if(error){$('#access-status').textContent='Impossible de vérifier votre accès. Réessayez dans un instant.';return}
  if(!data){$('#access-status').textContent='Votre compte est connecté, mais ne dispose pas du rôle administrateur. Ce rôle doit être attribué au compte enseignant après vérification de son adresse.';return}
  if(!resources.length){const response=await fetch('/administration/resources.json');if(!response.ok)throw Error('Liste des ressources indisponible');resources=await response.json();const read=async(table,order)=>{let rows=[];for(let i=0;;i+=500){const r=await client.from(table).select('*').order(order).range(i,i+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)return rows}};const [created,sections]=await Promise.all([read('canopee_created_drafts','resource_id'),read('canopee_section_drafts','id')]);for(const row of created){const c=sections.find(s=>s.id===row.chapter_id),t=sections.find(s=>s.id===c?.parent_id);if(c)resources.push({id:row.resource_id,title:row.content.title,created:true,level:c.level,chapter:c.title,chapter_id:c.id,theme:t?.title||'',type:row.type})}}
  if(generation!==epoch)return;authorized=true;$('#access').hidden=true;$('#workspace').hidden=false;if($('#level-filter').options.length===1)levels.forEach((name,index)=>$('#level-filter').add(new Option(name,String(index))));filterChapters();const target=resources.find(r=>r.id===decodeURIComponent(location.hash.slice(1)));if(target)open(target);
 }
 let accountId;
 api.ready.then(()=>{accountId=api.user?.id;return access()}).catch(()=>$('#access-status').textContent='Le service de connexion est momentanément indisponible.');
 window.addEventListener('canopee:workspace',()=>{const next=api.user?.id;if(next!==accountId){accountId=next;access().catch(()=>$('#access-status').textContent='Accès indisponible.')}});
})();
