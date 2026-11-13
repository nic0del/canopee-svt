const client=window.Canopee.client;
export const levelNames=['Seconde · SVT','Première spécialité · SVT','Terminale spécialité · SVT','Première · Enseignement scientifique','Terminale · Enseignement scientifique'];
let pending;
async function rows(table,columns,order){let out=[];for(let start=0;;start+=500){const {data,error}=await client.from(table).select(columns).order(order).range(start,start+499);if(error)throw error;out.push(...data);if(data.length<500)return out}}
let visibilityPending;
export function resourceVisibility(){
 return visibilityPending??=(async()=>{
  await window.Canopee.ready;
  const [states,pauses]=await Promise.all([
   rows('canopee_resource_visibility','resource_id,state','resource_id'),
   rows('canopee_resource_publications','resource_id,state','resource_id')
  ]);
  const hidden=new Set(pauses.filter(row=>row.state==='paused').map(row=>row.resource_id));
  for(const row of states){
   if(row.state==='visible')hidden.delete(row.resource_id);
   else hidden.add(row.resource_id);
  }
  return hidden;
 })();
}
export function collection(){return pending??=(async()=>{await window.Canopee.ready;if(!window.CATALOGUE)await import('/catalogue.js');const [sections,published,hidden]=await Promise.all([rows('canopee_section_publications','id,kind,level,title,parent_id','id'),rows('canopee_created_publications','resource_id,chapter_id,type,title:content->>title','resource_id'),resourceVisibility()]);const resources=published.filter(row=>!hidden.has(row.resource_id));const chapters=window.CATALOGUE;for(const chapter of chapters)chapter.resources=chapter.resources.filter(row=>!hidden.has(row.id));window.CanopeePublishedThemes=sections.filter(s=>s.kind==='theme');for(const s of sections.filter(s=>s.kind==='chapter')){if(chapters.some(c=>c.id===s.id))continue;const theme=sections.find(t=>t.id===s.parent_id);chapters.push({id:s.id,level:s.level,title:s.title,theme:theme?.title||'',resources:[],overview:'/chapitre/?id='+encodeURIComponent(s.id)})}for(const r of resources){const c=chapters.find(c=>c.id===r.chapter_id);if(c&&!c.resources.some(x=>x.id===r.resource_id))c.resources.push({id:r.resource_id,title:r.title,url:'/fiche/?id='+encodeURIComponent(r.resource_id),type:r.type,format:'Fiche web',created:true})}window.dispatchEvent(new CustomEvent('canopee:catalogue'));return {sections,resources,chapters}})()}
export function element(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e}
export function resourceLink(r){const a=element('a',r.title);a.href=r.url;return a}
async function enhance(){try{const data=await collection(),path=location.pathname;let chapter=data.chapters.find(c=>c.overview?.split('?')[0]===path);if(!chapter){const rid=document.body.dataset.resource;chapter=data.chapters.find(c=>c.resources.some(r=>r.id===rid))}if(!chapter)return;const additions=chapter.resources.filter(r=>r.created);if(!additions.length)return;const nav=document.querySelector('#chapter-nav');if(nav){const section=element('section');section.append(element('h2','Nouvelles ressources'));additions.forEach(r=>section.append(resourceLink(r)));nav.append(section)}if(chapter.overview?.split('?')[0]===path){const article=document.querySelector('article.lesson-content');if(article){const section=element('section',null,'new-resource-list');section.append(element('h2','Ressources ajoutées'));additions.forEach(r=>section.append(resourceLink(r)));article.append(section)}}}catch{}}
if(!document.body.dataset.dynamic)enhance();
