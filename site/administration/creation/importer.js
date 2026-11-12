import {readPDF} from '/administration/creation/pdf-import.js';
const makeId=()=> 'b'+crypto.randomUUID().replaceAll('-','');
function checkZip(buffer){const view=new DataView(buffer);let end=-1;for(let p=buffer.byteLength-22;p>=Math.max(0,buffer.byteLength-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break}if(end<0)throw Error('Ce fichier ne semble pas être un document Word .docx valide.');const entries=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);if(entries>2000||offset>=buffer.byteLength)throw Error('Document Word trop complexe. Exportez une version plus simple.');let size=0,p=offset;for(let i=0;i<entries;i++){if(p+46>buffer.byteLength||view.getUint32(p,true)!==0x02014b50)throw Error('Archive Word endommagée.');if(view.getUint16(p+8,true)&1)throw Error('Les documents chiffrés ne peuvent pas être importés.');size+=view.getUint32(p+24,true);if(size>52428800)throw Error('Le contenu décompressé dépasse 50 Mo.');p+=46+view.getUint16(p+28,true)+view.getUint16(p+30,true)+view.getUint16(p+32,true)}}
function word(buffer){checkZip(buffer);return new Promise((resolve,reject)=>{const worker=new Worker('/administration/creation/import-worker.js'),timer=setTimeout(()=>{worker.terminate();reject(Error('La conversion dépasse 30 secondes. Essayez un document plus court.'))},30000);worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data)};worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('Impossible de lire ce document Word.'))};worker.postMessage({buffer},[buffer])})}
async function imageFile(image,index){const bitmap=await createImageBitmap(new Blob([image.buffer],{type:image.mime}));if(bitmap.width*bitmap.height>30000000){bitmap.close();throw Error('Une image est trop grande. Réduisez sa résolution dans le document.')}const ratio=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.9));if(!blob)throw Error('Illustration illisible.');return {blob,mime:'image/webp',ext:'webp',name:'Illustration '+(index+1)+'.webp',token:'pending:'+index}}
export function builder(title){const content={title,texts:{},layout:[],attachments:[],imported:true,reviewed:false},warnings=[],files=[];let answerMode=false,lastQuestion=null,sectionContext='';
 function add(kind,text,extra={}){text=String(text||'').trim();if(!text&&kind!=='image')return;if(text.length>50000)throw Error('Un passage dépasse 50 000 caractères. Divisez ce document.');if(content.layout.length>=200)throw Error('Ce document dépasse 200 blocs. Importez-le en plusieurs parties.');const id=makeId();content.layout.push({id,kind,...extra});content.texts[id]=text;if(kind==='question')lastQuestion=id;return id}
 function line(raw,heading=false){let text=raw.replace(/\u00a0/g,' ').trim();if(!text)return;
  const contextual = text.match(/^(probl[ée]matique|question directrice|contexte|objectifs?|consignes?|production attendue|mat[ée]riel)\s*(?::\s*(.*))?$/i);
  if(contextual){
   const [,name,value]=contextual;
   sectionContext='context';
   answerMode=false;
   lastQuestion=null;
   add('heading',name[0].toUpperCase()+name.slice(1));
   if(value)add('paragraph',value);
   return;
  }
  const explicitQuestion=/^questions?\s*[:：]\s*/i;
  if(explicitQuestion.test(text)){
   sectionContext='';answerMode=false;
   text=text.replace(explicitQuestion,'').trim();
   if(!text){sectionContext='questions';add('heading','Questions');return}
   add('question',text);return;
  }
  if(/^(nom|pr[ée]nom|date)\s*[:：]\s*[._ …-]*$/i.test(text))return;
  if(/^[.\s_…·]{4,}$/.test(text)){if(lastQuestion||sectionContext==='context')return;const previous=content.layout.at(-1);if(previous&&previous.kind==='paragraph'){previous.kind='question';lastQuestion=previous.id}else add('question','Votre réponse');return}
  const blanks=/\.{4,}|_{4,}|…{2,}/.test(text);text=text.replace(/\.{4,}|_{4,}|…{2,}/g,' ').replace(/\s+/g,' ').trim();if(!text)return;
  if(heading||/^(contexte|probl[ée]matique|objectifs?|consignes?|questions?|documents?|bilan|cours|correction|corrig[ée]|[ée]l[ée]ments? de r[ée]ponse)\s*:?$/i.test(text)){sectionContext=/^questions?\s*:?$/i.test(text)?'questions':'';answerMode=/^(correction|corrig[ée]|[ée]l[ée]ments? de r[ée]ponse)/i.test(text);add('heading',text);lastQuestion=null;return}
  if(answerMode){add('help',text);return}
  const procedural=/^(?:\d+[.)]\s*)?(?:ouvrir|afficher|cliquer|s[ée]lectionner|faire (?:tourner|apparaître)|zoomer|passer en|colorer|rep[ée]rer)\b/i.test(text);
  const task=/^(?:\d+[.)]\s*)?(?:explique[rz]|compare[rz]|indique[rz]|d[ée]termine[rz]|calcule[rz]|justifie[rz]|d[ée]cri(?:s|vez)|identifie[rz]|compl[ée]te[rz]|propose[rz]|montre[rz]|r[ée]alise[rz]|r[ée]dige[rz]|analyse[rz])\b/i.test(text);
  const question=!procedural&&sectionContext!=='context'&&(blanks||text.includes('?')||task);
  add(question?'question':'paragraph',text);if(!question)lastQuestion=null;
 }
 function resetPage(){sectionContext='';lastQuestion=null}
 return {content,warnings,files,add,line,resetPage};
}
async function docx(file,buffer){const parsed=await word(buffer),result=builder(file.name.replace(/\.docx$/i,'')),doc=new DOMParser().parseFromString(parsed.html,'text/html');result.warnings.push(...parsed.warnings.slice(0,12));const images=await Promise.all(parsed.images.map(imageFile));let titleTaken=false;
 function image(node){const m=node.getAttribute('src')?.match(/^canopee-image:(\d+)$/);if(!m)return;const item=images[+m[1]];if(!item)return;result.files.push(item);result.add('image',node.getAttribute('alt')||'Illustration du document',{file:item.token})}
 function visit(node){if(node.nodeType!==1)return;const tag=node.tagName.toLowerCase();if(tag==='img'){image(node);return}if(tag==='table'){const rows=[...node.rows].map(r=>[...r.cells].map(c=>c.textContent.replace(/[\t\r\n]+/g,' ').trim()));if(rows.length>150||Math.max(0,...rows.map(r=>r.length))>20)throw Error('Un tableau est trop grand pour cet import.');const text=rows.map(r=>r.join('\t')).join('\n');if(result.content.layout.length<3&&/(?:classe|niveau)\s*[:：]|th[èe]me.{0,60}chapitre/i.test(text)){result.add('paragraph','Repères du document : '+rows.flat().filter(Boolean).join(' · '));result.warnings.push('L’encadré de classement a été transformé en repères textuels.')}else result.add('table',text);node.querySelectorAll('img').forEach(image);return}
 if(/^h[1-6]$/.test(tag)){const t=node.textContent.trim();if(!titleTaken&&tag==='h1'&&t){result.content.title=t.slice(0,240);titleTaken=true}else result.line(t,true);return}
 if(tag==='p'||tag==='li'){const hasImages=node.querySelector('img');if(hasImages){let text='';for(const part of node.childNodes){if(part.nodeType===1&&part.tagName.toLowerCase()==='img'){result.line(text);text='';image(part)}else{text+=part.textContent||'';if(part.nodeType===1&&part.querySelector('img')){result.line(text);text='';part.querySelectorAll('img').forEach(image)}}}result.line(text)}else for(const line of node.textContent.split(/\r?\n/))result.line(line);return}
 for(const child of node.children)visit(child)
 }
 for(const child of doc.body.children)visit(child);result.files=[...new Map(result.files.map(f=>[f.token,f])).values()];return result;
}
export async function convertDocument(file,options={}){if(!file||file.size>10485760)throw Error('Choisissez un document de 10 Mo maximum.');const extension=file.name.split('.').at(-1).toLowerCase();if(!['docx','pdf'].includes(extension))throw Error('Formats acceptés : Word .docx ou PDF.');const buffer=await file.arrayBuffer(),result=extension==='docx'?await docx(file,buffer):await readPDF(file,buffer,builder,options);if(!result.content.layout.length)throw Error('Aucun contenu exploitable n’a été trouvé.');if(JSON.stringify(result.content).length>420000)throw Error('Le document est trop long. Importez-le en plusieurs parties.');result.content.title=result.content.title.slice(0,240);result.stats={blocks:result.content.layout.length,questions:result.content.layout.filter(b=>b.kind==='question').length,images:result.content.layout.filter(b=>b.kind==='image').length,tables:result.content.layout.filter(b=>b.kind==='table').length};return result}
