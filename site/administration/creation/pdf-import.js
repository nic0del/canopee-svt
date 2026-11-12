import {assemblePDFLines,nativePDFLines,pdfImageRegions} from '/administration/creation/pdf-layout.js';
// PDF parsing and OCR run on the teacher's device. Only the engine files are downloaded.
let engine;
function loadEngine(){
 if(!engine)engine=new Promise((resolve,reject)=>{const script=document.createElement('script');const fail=()=>{clearTimeout(timer);engine=null;script.remove();reject(Error('Le moteur de reconnaissance de texte ne peut pas être chargé. Réessayez avec une connexion Internet.'))};const timer=setTimeout(fail,30000);script.src='/vendor/tesseract-6.0.1/tesseract.min.js';script.onload=()=>{clearTimeout(timer);resolve(window.Tesseract)};script.onerror=fail;document.head.append(script)});
 return engine;
}
export async function bounded(job,ms,onTimeout){let timer;try{return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout?.();reject(Error('La lecture de cette page est trop longue. Essayez un document plus court ou une résolution plus faible.'))},ms)})])}finally{clearTimeout(timer)}}
export async function readPDF(file,buffer,builder,options={}){
 const progress=options.progress||(()=>{}),visuals=options.visuals!==false,ocrEnabled=options.ocr!==false;
 const lib=await import('/vendor/pdfjs-5.4.296/build/pdf.min.mjs');
 lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs-5.4.296/build/pdf.worker.min.mjs';
 const task=lib.getDocument({data:buffer,isEvalSupported:false,enableXfa:false,cMapUrl:'/vendor/pdfjs-5.4.296/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs-5.4.296/standard_fonts/',wasmUrl:'/vendor/pdfjs-5.4.296/wasm/'});
 let pdf,worker,workerPromise,canvas;const result=builder(file.name.replace(/\.pdf$/i,''));let characters=0,scanned=0,lowConfidence=0,illustrations=0,omittedVisuals=false;const started=Date.now();
 try{
  pdf=await bounded(task.promise,30000,()=>task.destroy());
  if(pdf.numPages>29)throw Error('Import limité à 29 pages PDF. Divisez le document en plusieurs fiches.');
  for(let n=1;n<=pdf.numPages;n++){
   result.resetPage();
   if(Date.now()-started>360000)throw Error('Cet import dépasse six minutes. Divisez le document en plusieurs fiches.');
   progress('Lecture de la page '+n+' sur '+pdf.numPages+'…');
   const page=await bounded(pdf.getPage(n),30000),text=await bounded(page.getTextContent(),30000),items=text.items.filter(t=>t.str?.trim());
   const nativeText=items.map(t=>t.str).join(' '),needsOCR=nativeText.replace(/\s/g,'').length<40;
   const base=page.getViewport({scale:1});
   const operators=visuals?await bounded(page.getOperatorList(),30000):null;
   const regions=operators?pdfImageRegions(operators,lib.OPS,base):[];
   const scale=Math.min(2.4,2200/Math.max(base.width,base.height));
   if(regions.length||(needsOCR&&ocrEnabled)){
    const viewport=page.getViewport({scale});
    canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const render=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'});
    await bounded(render.promise,30000,()=>render.cancel());
   }
   let lines=[];
   if(needsOCR&&ocrEnabled){
    progress('Reconnaissance du texte · page '+n+' sur '+pdf.numPages+'…');
    if(!worker){
     const T=await loadEngine();
     workerPromise=T.createWorker('fra+eng',1,{workerPath:'/vendor/tesseract-6.0.1/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0'});
     worker=await bounded(workerPromise,90000,()=>workerPromise.then(w=>w.terminate()).catch(()=>{}));
    }
    const recognized=await bounded(worker.recognize(canvas,{}, {blocks:true}),90000,()=>worker.terminate());scanned++;
    if(recognized.data.confidence<65)lowConfidence++;
    const groups=recognized.data.blocks||[];
    lines=groups.flatMap(group=>group.paragraphs.flatMap(paragraph=>paragraph.lines.map((line,index)=>({
     text:line.text.trim(),x:line.bbox.x0/scale,y:line.bbox.y0/scale,
     height:(line.bbox.y1-line.bbox.y0)/scale,heading:false,
     breakBefore:index===0
    })))).sort((a,b)=>a.y-b.y||a.x-b.x);
    if(!lines.length&&recognized.data.text?.trim()){
     lines=recognized.data.text.split(/\r?\n/).map((text,index)=>({text,x:0,y:index*12,height:12,heading:false}));
    }
   }else{
    lines=nativePDFLines(items,base);
    if(needsOCR)result.warnings.push('Page '+n+' : texte insuffisant et reconnaissance désactivée.');
   }
   const pageTitle=lines.slice(0,3).map(line=>line.text).join(' ');
   const guide=needsOCR&&regions.length===1&&regions[0].width*regions[0].height>base.width*base.height*.5&&
    /^(?:fiche technique|mode d[’']emploi|tutoriel|guide d[’']utilisation|visualisation de molécules avec)\b/i.test(pageTitle.trim());
   const entries=guide?[]:assemblePDFLines(lines.filter(line=>! /^(?:classe|matière|niveau|thème|chapitre|titre)\s*:/i.test(line.text)));
   for(const region of regions){
    if(illustrations>=25){omittedVisuals=true;break}
    const crop=document.createElement('canvas');crop.width=Math.ceil(region.width*scale);crop.height=Math.ceil(region.height*scale);
    crop.getContext('2d').drawImage(canvas,region.left*scale,region.top*scale,region.width*scale,region.height*scale,0,0,crop.width,crop.height);
    const blob=await new Promise(resolve=>crop.toBlob(resolve,'image/webp',.9));
    crop.width=0;crop.height=0;
    if(!blob){omittedVisuals=true;continue}
    const token='pdf-illustration:'+(++illustrations);
    result.files.push({blob,mime:'image/webp',ext:'webp',name:'Illustration '+illustrations+'.webp',token});
    entries.push({y:region.top,token,text:guide?lines[0].text:'Illustration '+illustrations+' · page '+n+' du PDF'});
   }
   for(const entry of entries.sort((a,b)=>a.y-b.y)){
    if(entry.token)result.add('image',entry.text,{file:entry.token});
    else{characters+=entry.text.length;result.line(entry.text,entry.heading)}
   }
   if(canvas){canvas.width=0;canvas.height=0;canvas=null}page.cleanup();
  }
  if(characters<40&&!illustrations)throw Error('Aucun texte ni illustration isolée exploitable. Activez la reconnaissance ou utilisez un PDF plus net.');
  if(scanned)result.warnings.push(scanned+' page(s) traitée(s) par reconnaissance automatique. Vérifiez les noms, unités et formules.');
  if(lowConfidence)result.warnings.push(lowConfidence+' page(s) avec un texte difficile à reconnaître.');
  if(omittedVisuals)result.warnings.push('Certains visuels sont à ajouter manuellement.');
  if(visuals)result.warnings.push('Seules les images isolées ont été intégrées. Vérifiez les schémas vectoriels et les figures sur les pages scannées.');
  result.warnings.push('Vérifiez les limites des questions et l’ordre des colonnes avant de publier.');
  return result;
 }finally{if(canvas){canvas.width=0;canvas.height=0}if(worker)await worker.terminate().catch(()=>{});if(pdf)await pdf.destroy();else await task.destroy()}
}
