/* Canopée — optional personal workspace. Only a public browser key belongs here. */
(() => {
  'use strict';
  const client = window.supabase?.createClient('https://ksvwaaafumiuinfhtrkv.supabase.co',
    'sb_publishable_v_cStkNfd6Xpq7VglDQHcw_wsxu4hxr',
    {auth:{storageKey:'canopee-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const callback = location.origin + '/compte/';
  let user = null, generation = 0, networkError = false, storageError = false;
  let answerCache = {}, favoriteCache = {}, chain = Promise.resolve(), timer;
  const fields = new Map();
  const resource = document.body.dataset.resource;
  const safeRead = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback} catch {return fallback}};
  const write = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));return true} catch {storageError=true;return false}};
  const scope = () => user?.id || 'guest';
  const answerKey = () => 'canopee:answers:'+scope()+':'+resource;
  const favoriteKey = () => 'canopee:favorites:'+scope();
  const emit = () => {window.dispatchEvent(new CustomEvent('canopee:workspace'));updateAccount();updateFields()};
  const stamp = () => new Date().toISOString();
  function readCaches() {
    storageError=false;
    answerCache = resource ? safeRead(answerKey(),{}) : {};
    favoriteCache = safeRead(favoriteKey(),{});
    if(!user) {
      for(const input of document.querySelectorAll('[data-answer]')) {
        if(Object.hasOwn(answerCache,input.dataset.answer)) continue;
        try {
          const value=localStorage.getItem('canopee:practice:'+resource+':'+input.dataset.answer)
            ?? localStorage.getItem('canopee:chapter1:'+resource+':'+input.dataset.answer);
          if(value!==null) answerCache[input.dataset.answer]={body:value,updated_at:stamp(),dirty:false};
        } catch {}
      }
      for(const id of safeRead('canopee-drive-favorites',[])) {
        if(typeof id==='string'&&!Object.hasOwn(favoriteCache,id)) favoriteCache[id]={saved:true,updated_at:stamp(),dirty:false};
      }
    }
  }
  function persist() {
    if(resource) write(answerKey(),answerCache);
    write(favoriteKey(),favoriteCache);
  }
  const feedbackStopWords = new Set((
    'alors ainsi aussi autre autres aucun aucune avec avoir cette comme comment dans davantage depuis donc dont elle elles encore entre est etaient etait etre eux fait faut fois hors jusque leur leurs lors mais meme moins notre nous par parce parmi pas pendant peut peuvent plus pour pourquoi quand quel quelle quels quelles selon sera serait sont sous souvent toute toutes tous tres trouve trouver une vers voici votre vous les des ses ces aux sur qui que quoi lui ils dix deux trois premier premiere plusieurs indique indiquer permet permettent permettre reponse question document documents resultat resultats exemple observes observe observer'
  ).split(' '));

  function feedbackWords(text) {
    const normalized = text.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const words = new Map();
    for (const word of normalized.match(/[a-z]{3,}/g) || []) {
      if (feedbackStopWords.has(word)) continue;
      const key = word.length > 5 ? word.replace(/(?:es|s)$/, '') : word;
      if (!words.has(key)) words.set(key, word);
    }
    return words;
  }

  function bindFeedback(input, block, correction) {
    if ([...block.children].some(node => node.matches('button') && node.textContent === 'Vérifier ma réponse')) return;
    if (block.querySelectorAll('[data-answer]').length !== 1) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Vérifier ma réponse';
    const result = document.createElement('div');
    result.className = 'answer-feedback';
    result.hidden = true;
    result.setAttribute('role', 'status');
    if (correction?.parentElement === block) correction.before(button, result);
    else block.append(button, result);

    function render() {
      const response = input.value.trim();
      result.replaceChildren();
      result.hidden = false;
      if (!/[\p{L}\p{N}]/u.test(response)) {
        result.textContent = 'Écris une réponse pour obtenir un retour.';
        return;
      }
      if (!correction) {
        result.textContent = 'Réponse saisie. Cette question n’a pas de corrigé associé. Relis la consigne et vérifie que tu réponds à chaque partie avec les données ou les arguments demandés.';
        return;
      }
      const model = [...correction.children]
        .filter(node => node.tagName !== 'SUMMARY').map(node => node.textContent).join(' ');
      const expected = feedbackWords(model);
      const found = feedbackWords(response);
      const overlap = [...expected.keys()].filter(word => found.has(word));
      const prompt = document.createElement('p');
      if (!expected.size) {
        prompt.textContent = 'Compare directement ta démarche avec le corrigé de la fiche.';
      } else if (overlap.length) {
        prompt.textContent = 'Termes du corrigé repérés dans ta réponse : ' + overlap.map(word => found.get(word)).join(', ') + '. Vérifie que tu les relies correctement dans ton raisonnement.';
      } else {
        prompt.textContent = 'Je ne retrouve pas de termes distinctifs du corrigé dans ta réponse. Vérifie ton raisonnement ou compare les formulations avec le corrigé.';
      }
      const note = document.createElement('p');
      note.textContent = 'Ce retour indicatif s’appuie sur le vocabulaire. Une formulation différente peut être juste, et un terme présent peut être mal employé.';
      result.append(prompt, note);
    }
    button.addEventListener('click', render);
    let lastValue = input.value;
    return () => {
      if (input.value === lastValue) return;
      lastValue = input.value;
      result.hidden = true;
      result.replaceChildren();
    };
  }

  function bindCorrection(input) {
    const block=input.closest('.answer-block');
    if(!block || block.querySelectorAll('[data-answer]').length!==1)return;
    const details=[...block.querySelectorAll('details.model-answer'),block.nextElementSibling]
      .find(node=>node?.matches('details.model-answer') &&
        /^(Afficher un élément de réponse|Afficher la correction)$/i.test(node.querySelector('summary')?.textContent.trim()||''));
    const updateFeedback=bindFeedback(input,block,details);
    if(!details)return updateFeedback;
    const summary=details.querySelector('summary');
    const label=summary.querySelector('[data-cms-block]')||summary;
    function update(){
      updateFeedback?.();
      const answered=Boolean(input.value.trim());
      if(!answered)details.open=false;
      summary.setAttribute('aria-disabled',String(!answered));
      label.textContent=answered?(details.open?'Masquer la correction':'Afficher la correction'):'Écris ta réponse pour afficher la correction';
    }
    summary.addEventListener('click',event=>{if(!input.value.trim())event.preventDefault()});
    details.addEventListener('toggle',()=>{
      if(details.open&&!input.value.trim())details.open=false;
      if(input.value.trim())label.textContent=details.open?'Masquer la correction':'Afficher la correction';
    });
    return update;
  }
  function updateFields() {
    for(const [id,{input,status,updateCorrection}] of fields) {
      const row=answerCache[id];
      if(document.activeElement!==input&&input.value!==(row?.body||'')) input.value=row?.body||'';
      updateCorrection?.();
      status.textContent=storageError ? 'Sauvegarde locale indisponible : copiez votre réponse avant de quitter.'
        : !user ? 'Enregistré sur cet appareil uniquement'
        : row?.dirty ? (networkError?'Connexion interrompue · conservé sur cet appareil, synchronisation à réessayer.':'Enregistré sur cet appareil · sauvegarde en ligne en cours…')
        : networkError ? 'Connexion interrompue · dernière copie disponible sur cet appareil.'
        : row ? 'Sauvegardé dans votre espace personnel' : 'Votre réponse sera sauvegardée dans votre espace personnel';
    }
  }
  function setAnswer(id,body) {
    if(!user)try{localStorage.removeItem('canopee:practice:'+resource+':'+id);localStorage.removeItem('canopee:chapter1:'+resource+':'+id)}catch{}
    answerCache[id]={body,updated_at:stamp(),dirty:!!user};persist();emit();schedule();
  }
  function setFavorite(id,saved) {
    favoriteCache[id]={saved,updated_at:stamp(),dirty:!!user};persist();emit();schedule();
  }
  function getFavorites() {return Object.entries(favoriteCache).filter(([,r])=>r.saved).map(([id])=>id)}
  function schedule() {clearTimeout(timer);if(user) timer=setTimeout(()=>sync(),650)}
  async function syncNow() {
    if(!user||!client) return;
    const epoch=generation, owner=user.id;
    const same=()=>epoch===generation&&user?.id===owner;
    try {
      // Writes are serialized; a pending local edit wins over the last downloaded copy.
      for(const [id,row] of Object.entries(answerCache)) if(row.dirty) {
        const copy={...row};
        const {error}=await client.from('canopee_answers').upsert({user_id:owner,resource_id:resource,answer_id:id,body:copy.body,updated_at:copy.updated_at});
        if(error) throw error;
        if(!same()) return;
        if(answerCache[id]?.updated_at===copy.updated_at) answerCache[id].dirty=false;
      }
      for(const [id,row] of Object.entries(favoriteCache)) if(row.dirty) {
        const copy={...row};
        const {error}=await client.from('canopee_favorites').upsert({user_id:owner,chapter_id:id,saved:copy.saved,updated_at:copy.updated_at});
        if(error) throw error;
        if(!same()) return;
        if(favoriteCache[id]?.updated_at===copy.updated_at) favoriteCache[id].dirty=false;
      }
      const tasks=[client.from('canopee_favorites').select('chapter_id,saved,updated_at').eq('user_id',owner)];
      if(resource) tasks.push(client.from('canopee_answers').select('answer_id,body,updated_at').eq('user_id',owner).eq('resource_id',resource));
      const results=await Promise.all(tasks);
      if(!same()) return;
      for(const result of results) if(result.error) throw result.error;
      for(const row of results[0].data) if(!favoriteCache[row.chapter_id]?.dirty) favoriteCache[row.chapter_id]={saved:row.saved,updated_at:row.updated_at,dirty:false};
      for(const row of results[1]?.data||[]) if(!answerCache[row.answer_id]?.dirty) answerCache[row.answer_id]={body:row.body,updated_at:row.updated_at,dirty:false};
      networkError=false;persist();emit();
    } catch {if(same()) {networkError=true;persist();emit()}}
  }
  function sync() {chain=chain.then(syncNow,syncNow);return chain}
  function switchUser(next) {
    if(next?.id===user?.id) {user=next;updateAccount();return}
    generation++;user=next;networkError=false;readCaches();persist();
    // Clear the previous account's visible answers, including a currently focused field.
    for(const [id,{input}] of fields) input.value=answerCache[id]?.body||'';
    emit();if(user)sync();
  }
  async function boot() {
    readCaches();
    try {const {data,error}=await client.auth.getSession();if(error)throw error;switchUser(data.session?.user||null)}
    catch {networkError=true;emit()}
    return true;
  }
  const api=window.Canopee={client,ready:null,get user(){return user},getAnswer:id=>answerCache[id]?.body||'',setAnswer,setFavorite,getFavorites,sync,
    bindAnswer(input,status){const updateCorrection=bindCorrection(input);fields.set(input.dataset.answer,{input,status,updateCorrection});input.value=api.getAnswer(input.dataset.answer);updateFields();
      input.addEventListener('input',()=>{setAnswer(input.dataset.answer,input.value);updateCorrection?.()});
      input.closest('.answer-block').querySelector('.clear-answer')?.addEventListener('click',()=>{input.value='';setAnswer(input.dataset.answer,'');updateCorrection?.();input.focus()});}
  };
  const panel=document.createElement('dialog');panel.className='account-panel';panel.id='personal-workspace';panel.setAttribute('aria-labelledby','account-title');
  panel.innerHTML=`<button type="button" class="account-close" aria-label="Fermer mon espace">×</button>
    <h2 id="account-title">Mon espace personnel</h2>
    <p class="account-small">Les cours restent accessibles sans compte. Vos réponses ne sont pas transmises à un enseignant.</p>
    <div id="account-signed-out"><div class="account-tabs" aria-label="Choisir une action"><button type="button" data-mode="login" aria-pressed="true">Se connecter</button><button type="button" data-mode="signup" aria-pressed="false">Créer un compte</button></div>
    <form id="account-form"><label for="account-email">Adresse e-mail</label><input id="account-email" type="email" autocomplete="email" required maxlength="254">
    <label for="account-password">Mot de passe</label><input id="account-password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"><p class="account-small">Au moins 8 caractères.</p>
    <div class="account-actions"><button id="account-submit" type="submit">Se connecter</button><button class="secondary" type="button" id="account-forgot">Mot de passe oublié</button></div></form></div>
    <div id="account-signed-in" hidden><p id="account-identity"></p><p class="account-summary" id="account-sync-status"></p>
    <div class="account-actions"><button id="account-sync">Réessayer la synchronisation</button><button class="secondary" id="account-logout">Se déconnecter</button></div>
    <p class="account-small">Sur un appareil partagé, déconnectez-vous en terminant. Les brouillons écrits sans compte restent séparés de votre espace personnel.</p>
    <button class="account-button" id="account-import">Importer mes brouillons et favoris de cet appareil</button><p class="account-small">L’import ajoute les réponses absentes du compte et les favoris de cet appareil. Les réponses déjà présentes dans le compte sont conservées.</p>
    <div class="account-actions"><button class="secondary" id="account-export">Exporter mes réponses</button><button class="secondary account-danger" id="account-delete">Effacer mes réponses et favoris en ligne</button></div>
    <div id="account-delete-confirm" hidden><p>Effacer toutes vos réponses et tous vos favoris enregistrés dans ce compte ? Cette opération ne peut pas être annulée. Vous pouvez d’abord les exporter.</p><div class="account-actions"><button class="account-danger" id="account-delete-yes">Confirmer l’effacement</button><button class="secondary" id="account-delete-no">Annuler</button></div></div></div>
    <form id="account-recovery" hidden><label for="account-new-password">Nouveau mot de passe</label><input id="account-new-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><div class="account-actions"><button type="submit">Enregistrer le nouveau mot de passe</button></div></form>
    <p id="account-feedback" class="account-feedback" role="status" aria-live="polite"></p><p class="account-small"><a href="/compte/">Fonctionnement et données personnelles ↗</a></p>`;
  document.body.append(panel);
  const q=s=>panel.querySelector(s);
  let mode='login',busy=false,recovery=false;
  const feedback=text=>{q('#account-feedback').textContent=text};
  function updateAccount() {
    if(!panel.isConnected)return;
    document.querySelectorAll('[data-account-open]').forEach(b=>b.textContent=user?'Mon espace':'Se connecter');
    q('#account-signed-out').hidden=!!user||recovery;q('#account-signed-in').hidden=!user||recovery;q('#account-recovery').hidden=!recovery;
    if(user) {q('#account-identity').textContent='Connecté avec '+user.email;q('#account-sync-status').textContent=networkError?'La sauvegarde en ligne est momentanément indisponible. Vos modifications restent sur cet appareil.':Object.values(answerCache).some(r=>r.dirty)||Object.values(favoriteCache).some(r=>r.dirty)?'Sauvegarde en cours…':'Votre espace personnel est synchronisé.'}
    const note=document.querySelector('.practice-note');if(note)note.textContent=user?'✎ Vos réponses sont sauvegardées dans votre espace personnel et ne sont pas transmises à un enseignant.':'✎ Répondez directement dans cette page. Sans compte, vos réponses restent sur cet appareil. Connectez-vous pour les retrouver ailleurs.';
  }
  function openPanel(){if(!panel.open)panel.showModal();updateAccount()}
  document.querySelectorAll('[data-account-open]').forEach(b=>b.addEventListener('click',openPanel));
  let host=document.querySelector('.topbar')||document.querySelector('main>header');
  if(host&&!document.querySelector('[data-account-open]')) {const b=document.createElement('button');b.type='button';b.className='account-button';b.dataset.accountOpen='';b.textContent='Se connecter';host.append(b);b.addEventListener('click',openPanel)}
  q('.account-close').onclick=()=>panel.close();panel.addEventListener('click',e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)panel.close()}});
  function setMode(next){mode=next;q('#account-password').autocomplete=mode==='signup'?'new-password':'current-password';q('#account-submit').textContent=mode==='signup'?'Créer mon compte':'Se connecter';panel.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));feedback('')}
  panel.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  async function run(work) {if(busy)return;busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work()}catch{feedback('Le service est momentanément indisponible. Réessayez dans un instant ; vos brouillons locaux sont conservés.')}finally{busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false)}}
  function authError(error) {
    if(error?.code==='email_not_confirmed')return 'Confirmez votre adresse grâce au lien reçu par e-mail avant de vous connecter.';
    if(/rate|over_email_send_rate_limit/.test(error?.code||''))return 'Trop de tentatives ou limite d’envoi atteinte. Attendez avant de réessayer.';
    if(error?.code==='email_address_not_authorized')return 'L’envoi des e-mails n’est pas encore ouvert à toutes les adresses. Vous pouvez continuer sans compte.';
    if(error?.code==='weak_password')return 'Choisissez un mot de passe plus robuste, d’au moins 8 caractères.';
    if(error?.code==='signup_disabled')return 'La création de comptes est momentanément désactivée. Les ressources restent consultables sans compte.';
    return 'Connexion impossible. Vérifiez votre adresse, votre mot de passe et la confirmation de votre e-mail.';
  }
  q('#account-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{if(!client)throw Error();feedback('Connexion au service…');
    const email=q('#account-email').value.trim(),password=q('#account-password').value;
    const result=mode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:callback}}):await client.auth.signInWithPassword({email,password});
    q('#account-password').value='';if(result.error){feedback(authError(result.error));return}
    if(result.data.session){switchUser(result.data.user);await sync();feedback('Vous êtes connecté. Vos réponses sont maintenant liées à votre compte.')}else feedback('Si cette adresse permet une inscription, un e-mail de confirmation vous a été envoyé. Vérifiez aussi les courriers indésirables.');
  })});
  q('#account-forgot').onclick=()=>{if(!q('#account-email').reportValidity())return;run(async()=>{const {error}=await client.auth.resetPasswordForEmail(q('#account-email').value.trim(),{redirectTo:callback});feedback(error?authError(error):'Si cette adresse possède un compte, un lien de réinitialisation vous sera envoyé.')})};
  q('#account-recovery').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const {error}=await client.auth.updateUser({password:q('#account-new-password').value});if(error){feedback(authError(error));return}q('#account-new-password').value='';recovery=false;updateAccount();feedback('Votre nouveau mot de passe est enregistré.')})});
  q('#account-sync').onclick=()=>run(async()=>{await sync();feedback(networkError?'La connexion est toujours indisponible. Vos modifications restent conservées sur cet appareil.':'Synchronisation terminée.')});
  q('#account-logout').onclick=()=>run(async()=>{await sync();if(Object.values(answerCache).some(r=>r.dirty)||Object.values(favoriteCache).some(r=>r.dirty)){feedback('Des modifications attendent encore la sauvegarde en ligne. Réessayez la synchronisation avant de vous déconnecter.');return}
    const old=user?.id;const {error}=await client.auth.signOut({scope:'local'});if(error){feedback('La déconnexion a échoué. Réessayez.');return}
    // Remove this account’s cached answers after successful logout on a shared device.
    try {for(const key of Object.keys(localStorage)) if(key.startsWith('canopee:answers:'+old+':')||key==='canopee:favorites:'+old)localStorage.removeItem(key)}catch{}
    switchUser(null);feedback('Vous êtes déconnecté. Les réponses de votre compte ont été retirées de cet appareil.');
  });
  async function allRows(table,columns) {
    const rows=[];for(let start=0;;start+=500){let query=client.from(table).select(columns).eq('user_id',user.id).order(table==='canopee_answers'?'resource_id':'chapter_id');if(table==='canopee_answers')query=query.order('answer_id');const {data,error}=await query.range(start,start+499);if(error)throw error;rows.push(...data);if(data.length<500)return rows}
  }
  q('#account-export').onclick=()=>run(async()=>{await sync();if(networkError){feedback('L’export complet nécessite une connexion. Réessayez lorsque la synchronisation fonctionne.');return}const answers=await allRows('canopee_answers','resource_id,answer_id,body,updated_at');const favorites=await allRows('canopee_favorites','chapter_id,saved,updated_at');const url=URL.createObjectURL(new Blob([JSON.stringify({exported_at:stamp(),answers,favorites},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mes-reponses-canopee.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback('Votre export a été préparé.')});
  q('#account-delete').onclick=()=>q('#account-delete-confirm').hidden=false;q('#account-delete-no').onclick=()=>q('#account-delete-confirm').hidden=true;
  q('#account-delete-yes').onclick=()=>run(async()=>{clearTimeout(timer);await chain;const owner=user.id;for(const table of ['canopee_answers','canopee_favorites']){const {error}=await client.from(table).delete().eq('user_id',owner);if(error)throw error}try{for(const key of Object.keys(localStorage))if(key.startsWith('canopee:answers:'+owner+':')||key==='canopee:favorites:'+owner)localStorage.removeItem(key)}catch{}answerCache={};favoriteCache={};for(const {input} of fields.values())input.value='';persist();emit();q('#account-delete-confirm').hidden=true;feedback('Vos réponses et favoris ont été effacés en ligne. Votre compte est conservé.');});
  q('#account-import').onclick=()=>run(async()=>{await sync();if(networkError){feedback('Reconnectez-vous à Internet avant l’import.');return}const owner=user.id,existing=await allRows('canopee_answers','resource_id,answer_id');const ids=new Set(existing.map(r=>r.resource_id+':'+r.answer_id)),rows=new Map();
    for(const key of Object.keys(localStorage)) {
      if(key.startsWith('canopee:answers:guest:')) {const rid=key.slice('canopee:answers:guest:'.length);for(const [id,row] of Object.entries(safeRead(key,{})))if(row.body&&!ids.has(rid+':'+id))rows.set(rid+':'+id,{user_id:owner,resource_id:rid,answer_id:id,body:row.body,updated_at:stamp()})}
      else if(key.startsWith('canopee:practice:')||key.startsWith('canopee:chapter1:')){const parts=key.split(':'),rid=parts[2],id=parts[3],body=localStorage.getItem(key);if(body&&!ids.has(rid+':'+id)&&!rows.has(rid+':'+id))rows.set(rid+':'+id,{user_id:owner,resource_id:rid,answer_id:id,body,updated_at:stamp()})}
    }
    const list=[...rows.values()];for(let i=0;i<list.length;i+=100){const {error}=await client.from('canopee_answers').upsert(list.slice(i,i+100),{onConflict:'user_id,resource_id,answer_id',ignoreDuplicates:true});if(error)throw error}
    const guest=safeRead('canopee:favorites:guest',{});for(const id of safeRead('canopee-drive-favorites',[]))if(!Object.hasOwn(guest,id))guest[id]={saved:true};for(const [id,row] of Object.entries(guest))if(row.saved&&!Object.hasOwn(favoriteCache,id))favoriteCache[id]={saved:true,dirty:true,updated_at:stamp()};persist();await sync();feedback(networkError?'Import commencé ; certaines données attendent une nouvelle connexion.':list.length+' réponse(s) importée(s). Vos réponses déjà présentes dans le compte ont été conservées.');
  });
  client?.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{switchUser(session?.user||null);if(event==='PASSWORD_RECOVERY'){recovery=true;openPanel();updateAccount()}if(event==='SIGNED_IN'&&location.pathname==='/compte/'){openPanel()}},0)});
  window.addEventListener('online',()=>sync());window.addEventListener('focus',()=>{if(user)sync()});
  window.addEventListener('storage',e=>{if(e.key===answerKey()||e.key===favoriteKey()){readCaches();emit();if(user)sync()}});
  api.ready=boot().then(()=>{emit();if(user)return sync()});
})();
