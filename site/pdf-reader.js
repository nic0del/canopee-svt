import {getDocument,GlobalWorkerOptions} from '/vendor/pdfjs-5.4.296/build/pdf.min.mjs';
GlobalWorkerOptions.workerSrc='/vendor/pdfjs-5.4.296/build/pdf.worker.min.mjs';
export async function mountPDF(host) {
  if(host.dataset.mounted==='true')return;
  host.dataset.mounted='true';
  const source=new URL(host.dataset.pdf,location.href);
  host.innerHTML=`<div class="pdf-controls" aria-label="Navigation dans le support"><button type="button" data-prev disabled>← Précédente</button><label>Page <input type="number" min="1" value="1" aria-label="Numéro de page du support"></label><span class="pdf-total"></span><button type="button" data-next disabled>Suivante →</button><button type="button" data-less aria-label="Réduire le support" disabled>−</button><button type="button" data-more aria-label="Agrandir le support" disabled>+</button></div><p class="pdf-state" role="status" aria-live="polite">Chargement du support…</p><div class="pdf-canvas-wrap"><canvas role="img" aria-label="Page du support"></canvas></div><details class="pdf-transcript"><summary>Afficher le texte et les liens de cette page</summary><p class="pdf-state">Extraction automatique ; les schémas et la mise en page restent à consulter dans le document.</p><div class="pdf-page-text"></div><div class="pdf-links"></div></details>`;
  const q=s=>host.querySelector(s),canvas=q('canvas'),wrap=q('.pdf-canvas-wrap'),state=q('.pdf-state'),input=q('input');
  let pdf=null,pageNo=1,zoom=1,busy=false,renderTask=null;
  function buttons(){q('[data-prev]').disabled=busy||!pdf||pageNo<=1;q('[data-next]').disabled=busy||!pdf||pageNo>=pdf.numPages;q('[data-less]').disabled=busy||!pdf||zoom<=1;q('[data-more]').disabled=busy||!pdf||zoom>=3;input.disabled=busy||!pdf}
  async function render(){
    if(!pdf||busy)return;busy=true;buttons();state.textContent='Affichage de la page…';
    try {
      const page=await pdf.getPage(pageNo),base=page.getViewport({scale:1});
      const available=Math.max(180,wrap.clientWidth-parseFloat(getComputedStyle(wrap).paddingLeft)-parseFloat(getComputedStyle(wrap).paddingRight));
      const viewport=page.getViewport({scale:available/base.width*zoom}),ratio=Math.min(devicePixelRatio||1,2);
      canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=Math.floor(viewport.width)+'px';canvas.style.height=Math.floor(viewport.height)+'px';canvas.setAttribute('aria-label','Page '+pageNo+' sur '+pdf.numPages+' du support');
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});await renderTask.promise;
      input.value=pageNo;input.max=pdf.numPages;q('.pdf-total').textContent='/ '+pdf.numPages;state.textContent='Page '+pageNo+' sur '+pdf.numPages+' · Utilisez + pour agrandir et faites défiler le document si nécessaire.';
      const text=await page.getTextContent();q('.pdf-page-text').textContent=text.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');
      const annotations=await page.getAnnotations(),links=q('.pdf-links');links.replaceChildren();
      const urls=new Set();for(const a of annotations){if(!a.url||urls.has(a.url))continue;let u;try{u=new URL(a.url)}catch{continue}if(!['https:','http:'].includes(u.protocol))continue;urls.add(a.url);const link=document.createElement('a');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=u.href;links.append(link)}
      host.dataset.rendered='true';
    }catch(error){host.dataset.rendered='false';state.textContent='Cette page n’a pas pu être affichée. Vous pouvez ouvrir le support original avec le lien au-dessus.'}
    finally{busy=false;buttons()}
  }
  q('[data-prev]').onclick=()=>{if(!busy&&pageNo>1){pageNo--;render()}};q('[data-next]').onclick=()=>{if(!busy&&pageNo<pdf.numPages){pageNo++;render()}};
  q('[data-more]').onclick=()=>{if(!busy){zoom=Math.min(3,zoom+.5);render()}};q('[data-less]').onclick=()=>{if(!busy){zoom=Math.max(1,zoom-.5);render()}};
  input.onchange=()=>{if(pdf&&!busy){pageNo=Math.max(1,Math.min(pdf.numPages,Math.floor(Number(input.value)||1)));render()}};
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(),200)});
  try{pdf=await getDocument({url:source.href,cMapUrl:'/vendor/pdfjs-5.4.296/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs-5.4.296/standard_fonts/',wasmUrl:'/vendor/pdfjs-5.4.296/wasm/',isEvalSupported:false,enableXfa:false}).promise;await render()}
  catch{state.textContent='Le support n’a pas pu être chargé. Le lien au-dessus permet de consulter le fichier original.';const retry=document.createElement('button');retry.type='button';retry.className='pdf-retry';retry.textContent='Réessayer';retry.onclick=()=>location.reload();host.append(retry);buttons()}
}

for(const host of document.querySelectorAll('[data-pdf]')) mountPDF(host);
