let html5QrCode=null,cameras=[],travado=false,codigoPendente='',scannerAtivo=false,ultimoCodigo='',ultimoTempo=0;
let participantesCache={},etapasCache=[],operador=null,token='';

function apiUrl(){return (localStorage.getItem('SMEC_API_URL')||'').trim().replace('/dev','/exec')}
function setResultado(html,classe='aguardando'){const el=document.getElementById('resultado');el.className='resultado '+classe;el.innerHTML=html}
function setOnlineBadge(){const el=document.getElementById('offlineBadge');if(navigator.onLine){el.textContent='Online';el.className='badge on'}else{el.textContent='Offline';el.className='badge off'}atualizarFilaBadge()}
function atualizarFilaBadge(){document.getElementById('filaBadge').textContent='Fila: '+getFila().length}

function inicializar(){
  document.getElementById('apiUrl').value=apiUrl();
  token=localStorage.getItem('SMEC_TOKEN')||'';
  operador=JSON.parse(localStorage.getItem('SMEC_OPERADOR')||'null');
  carregarCacheLocal();setOnlineBadge();window.addEventListener('online',()=>{setOnlineBadge();sincronizarFila()});window.addEventListener('offline',setOnlineBadge);
  if(token&&operador) mostrarScanner();
  listarCameras();
}

function login(){
  const url=document.getElementById('apiUrl').value.trim().replace('/dev','/exec');
  const op=document.getElementById('operador').value.trim();
  const pin=document.getElementById('pin').value.trim();
  if(!url||!op||!pin){alert('Informe URL, operador e PIN.');return}
  localStorage.setItem('SMEC_API_URL',url);
  jsonp('login',{operador:op,pin:pin},res=>{
    if(!res.ok){alert(res.msg||'Login inválido');return}
    token=res.token;operador=res.operador;
    localStorage.setItem('SMEC_TOKEN',token);localStorage.setItem('SMEC_OPERADOR',JSON.stringify(operador));
    mostrarScanner();atualizarCache();
  },false);
}

function mostrarScanner(){document.getElementById('loginBox').classList.add('hidden');document.getElementById('scannerBox').classList.remove('hidden');document.getElementById('opNome').textContent='Operador: '+(operador?operador.nome:'');}

function jsonp(action,params,cb,auth=true){
  const callbackName='smec_cb_'+Date.now()+'_'+Math.floor(Math.random()*99999);
  window[callbackName]=function(data){cb(data);delete window[callbackName];script.remove()};
  const qs=new URLSearchParams(params||{});qs.set('action',action);qs.set('callback',callbackName);if(auth)qs.set('token',token);
  const script=document.createElement('script');script.src=apiUrl()+'?'+qs.toString();script.onerror=function(){cb({ok:false,tipo:'NET',msg:'Erro de conexão com Apps Script.'});delete window[callbackName];script.remove()};document.body.appendChild(script);
}

function atualizarCache(){
  if(!navigator.onLine){setResultado('<div class="big">Sem internet</div><div>Usando cache local.</div>','offline');return}
  setResultado('<div class="big">Atualizando cache...</div>','aguardando');
  jsonp('participantes',{},res=>{
    if(!res.ok){setResultado('<div class="big">Erro no cache</div><div>'+esc(res.msg)+'</div>','erro');return}
    participantesCache={};res.participantes.forEach(p=>participantesCache[p.codigo]=p);
    localStorage.setItem('SMEC_PARTICIPANTES',JSON.stringify(participantesCache));
    jsonp('etapas',{},r2=>{
      if(r2.ok){etapasCache=r2.etapas;localStorage.setItem('SMEC_ETAPAS',JSON.stringify(etapasCache));}
      atualizarInfoCache();setResultado('<div class="big">Cache atualizado</div><div>'+res.total+' participantes</div>','sucesso');voltarDepois(1000);
    });
  });
}
function carregarCacheLocal(){try{participantesCache=JSON.parse(localStorage.getItem('SMEC_PARTICIPANTES')||'{}');etapasCache=JSON.parse(localStorage.getItem('SMEC_ETAPAS')||'[]')}catch(e){participantesCache={};etapasCache=[]}atualizarInfoCache()}
function atualizarInfoCache(){const total=Object.keys(participantesCache).length;document.getElementById('cacheInfo').textContent='Cache: '+total+' participantes | Etapas: '+etapasCache.length}

function listarCameras(){Html5Qrcode.getCameras().then(devices=>{cameras=devices||[];const sel=document.getElementById('cameraSelect');sel.innerHTML='';if(!cameras.length){return}cameras.forEach((cam,i)=>{const opt=document.createElement('option');opt.value=cam.id;opt.textContent=cam.label||('Câmera '+(i+1));sel.appendChild(opt)});sel.value=escolherCameraPreferida(cameras).id}).catch(()=>{})}
function escolherCameraPreferida(lista){const l=x=>(x.label||'').toLowerCase();return lista.find(c=>l(c).includes('back')||l(c).includes('traseira')||l(c).includes('environment'))||lista.find(c=>l(c).includes('usb')||l(c).includes('web'))||lista[0]}
function iniciarScanner(){if(!apiUrl()){alert('Informe a URL do Web App.');return}if(scannerAtivo)return;const cameraId=document.getElementById('cameraSelect').value||(cameras[0]&&cameras[0].id);html5QrCode=new Html5Qrcode('reader',{verbose:false});const config={fps:18,qrbox:{width:260,height:260},aspectRatio:1.333,disableFlip:false,experimentalFeatures:{useBarCodeDetectorIfSupported:true}};setResultado('<div class="big">Aproxime o QR Code</div>');html5QrCode.start(cameraId,config,onScanSuccess,function(){}).then(()=>scannerAtivo=true).catch(err=>setResultado('<div class="big">Erro ao abrir câmera</div><div>'+esc(err)+'</div>','erro'))}
function pararScanner(){if(html5QrCode&&scannerAtivo){html5QrCode.stop().then(()=>{scannerAtivo=false;setResultado('<div class="big">Scanner parado</div>')})}}
function onScanSuccess(decodedText){const codigo=extrairCodigo(decodedText);const agora=Date.now();if(travado)return;if(codigo===ultimoCodigo&&(agora-ultimoTempo)<2500)return;ultimoCodigo=codigo;ultimoTempo=agora;travado=true;codigoPendente=codigo;if(html5QrCode&&scannerAtivo){try{html5QrCode.pause(true)}catch(e){}}processarCodigo(codigo)}
function extrairCodigo(texto){texto=String(texto||'').trim();const m=texto.match(/[?&]codigo=([^&]+)/);if(m)return decodeURIComponent(m[1]);return texto}
function lerManual(){const v=document.getElementById('codigoManual').value.trim();if(!v||travado)return;travado=true;codigoPendente=extrairCodigo(v);processarCodigo(codigoPendente)}

function processarCodigo(codigo){
  const p=participantesCache[codigo];
  if(!p){setResultado('<div class="big">Participante não encontrado</div><div>'+esc(codigo)+'</div>','erro');voltarDepois(1600);return}
  const etapaLocal=etapaAtualLocal();
  setResultado('<div class="big">Lido</div><div class="nome">'+esc(p.nome)+'</div><div class="meta">'+esc(p.unidade||'')+'</div>','aguardando');
  if(!navigator.onLine){salvarOfflineComEtapa(p,etapaLocal,false);return}
  registrarOnline(false);
}

function registrarOnline(autorizar){jsonp('registrar',{codigo:codigoPendente,autorizar:autorizar?'true':'false',dispositivo:navigator.userAgent},res=>{if(res.tipo==='NET'){const p=participantesCache[codigoPendente];salvarOfflineComEtapa(p,etapaAtualLocal(),false);return}mostrarResultado(res)})}
function mostrarResultado(res){
  if(!res.ok){
    if(res.tipo==='AUTH'){setResultado('<div class="big">Sessão expirada</div><div>Faça login novamente.</div>','erro');localStorage.removeItem('SMEC_TOKEN');voltarDepois(2500);return}
    if(res.tipo==='DUPLICADO'){setResultado('<div class="big">✖ JÁ REGISTRADO</div><div class="nome">'+esc(res.participante.nome)+'</div><div class="etapa">'+esc(res.etapa.dia)+'<br>'+esc(res.etapa.etapa)+'</div><div class="meta">'+esc(res.registro.dataHora)+'</div>','duplicado');voltarDepois(1600);return}
    setResultado('<div class="big">Erro</div><div>'+esc(res.msg||'Falha')+'</div>','erro');voltarDepois(2000);return
  }
  if(res.tipo==='REGISTRADO'){setResultado('<div class="big">✔ REGISTRADO</div><div class="nome">'+esc(res.participante.nome)+'</div><div class="etapa">'+esc(res.etapa.dia)+'<br>'+esc(res.etapa.etapa)+'</div><div class="meta">'+esc(res.dataHora)+'</div><div class="meta">'+esc(res.status)+'</div>','sucesso');voltarDepois(900);return}
  if(res.tipo==='AUTORIZACAO'){let h='<div class="big">⚠ ATENÇÃO</div><div class="nome">'+esc(res.participante.nome)+'</div><div class="etapa">'+esc(res.etapa.dia)+'<br>'+esc(res.etapa.etapa)+'</div>';if(res.alertas&&res.alertas.includes('FORA_HORARIO'))h+='<p>Este registro está fora do horário previsto.</p>';if(res.alertas&&res.alertas.includes('PENDENCIA_ANTERIOR'))h+='<p>Etapa anterior não registrada: <b>'+esc(res.etapaAnterior.etapa)+'</b></p>';h+='<div class="actions"><button class="btn ok" onclick="registrarOnline(true)">Permitir registro</button><button class="btn danger" onclick="cancelar()">Cancelar</button></div>';setResultado(h,'alerta');return}
  if(res.tipo==='NORMAL'){registrarOnline(false);return}
}

function etapaAtualLocal(){const agora=Date.now();let ativa=etapasCache.find(e=>agora>=Number(e.inicioMs)&&agora<=Number(e.fimMs));if(ativa)return {...ativa,dentroHorario:true};const hoje=new Date().toDateString();const hojeEtapas=etapasCache.filter(e=>new Date(Number(e.inicioMs)).toDateString()===hoje);if(!hojeEtapas.length)return null;let melhor=hojeEtapas[0],dist=Math.min(Math.abs(agora-melhor.inicioMs),Math.abs(agora-melhor.fimMs));hojeEtapas.forEach(e=>{const d=Math.min(Math.abs(agora-e.inicioMs),Math.abs(agora-e.fimMs));if(d<dist){dist=d;melhor=e}});return {...melhor,dentroHorario:false}}
function salvarOfflineComEtapa(p,etapa,autorizado){if(!etapa){setResultado('<div class="big">Sem etapa local</div><div>Atualize o cache quando houver internet.</div>','erro');voltarDepois(2200);return}if(!etapa.dentroHorario&&!autorizado){let h='<div class="big">⚠ OFFLINE</div><div class="nome">'+esc(p.nome)+'</div><div class="etapa">'+esc(etapa.dia)+'<br>'+esc(etapa.etapa)+'</div><p>Registro fora do horário. Permitir salvar offline?</p><div class="actions"><button class="btn ok" onclick="salvarOfflineComEtapa(participantesCache[codigoPendente], etapaAtualLocal(), true)">Permitir</button><button class="btn danger" onclick="cancelar()">Cancelar</button></div>';setResultado(h,'alerta');return}const rec={id:'off_'+Date.now()+'_'+Math.floor(Math.random()*99999),codigo:p.codigo,dia:etapa.dia,etapa:etapa.etapa,dataHora:new Date().toISOString(),status:etapa.dentroHorario?'REGISTRADO OFFLINE':'AUTORIZADO OFFLINE - FORA DO HORÁRIO',dispositivo:navigator.userAgent};const fila=getFila();fila.push(rec);setFila(fila);setResultado('<div class="big">✔ SALVO OFFLINE</div><div class="nome">'+esc(p.nome)+'</div><div class="etapa">'+esc(etapa.dia)+'<br>'+esc(etapa.etapa)+'</div><div class="meta">Será sincronizado depois.</div>','offline');voltarDepois(1000)}
function getFila(){try{return JSON.parse(localStorage.getItem('SMEC_OFFLINE_QUEUE')||'[]')}catch(e){return[]}}
function setFila(f){localStorage.setItem('SMEC_OFFLINE_QUEUE',JSON.stringify(f));atualizarFilaBadge()}
function sincronizarFila(){const fila=getFila();if(!fila.length||!navigator.onLine||!token){atualizarFilaBadge();return}setResultado('<div class="big">Sincronizando...</div><div>'+fila.length+' registros pendentes</div>');syncProximo(fila,0,[])}
function syncProximo(fila,i,restantes){if(i>=fila.length){setFila(restantes);setResultado('<div class="big">Sincronização concluída</div><div>Pendentes: '+restantes.length+'</div>',restantes.length?'offline':'sucesso');voltarDepois(1600);return}const rec=fila[i];jsonp('syncOffline',{registro:encodeURIComponent(JSON.stringify(rec))},res=>{if(!res.ok&&res.tipo==='AUTH'){restantes.push(rec)}else if(!res.ok&&res.tipo==='NET'){restantes=restantes.concat(fila.slice(i));setFila(restantes);setResultado('<div class="big">Sem conexão</div><div>Restam '+restantes.length+'</div>','offline');voltarDepois(1600);return}syncProximo(fila,i+1,restantes)})}
function cancelar(){setResultado('<div class="big">Registro cancelado</div>','erro');voltarDepois(900)}
function voltarDepois(ms=1000){setTimeout(()=>{document.getElementById('codigoManual').value='';setResultado('<div class="big">Aproxime o QR Code</div>');travado=false;if(html5QrCode&&scannerAtivo){try{html5QrCode.resume()}catch(e){}}},ms)}
function esc(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}

inicializar();
