/* ===== v3: AUTH / PROFILE (premium) / WEBSITE LANGUAGE ===== */
/* Real Google/Email login er jonno Firebase config ekhane boshao: {apiKey:'..',authDomain:'..',projectId:'..',appId:'..'} */
var FIREBASE_CONFIG=null;
var SEASONS={},EPN={};
var LANGS=[['sub','Sub'],['dub','Dub']]; /* Hindi & Bangla removed */
var AV=[['Naruto','m','#ff9d2e','#7a2e00'],['Luffy','m','#ef4444','#5b0f0f'],['Eren Yeager','m','#34d399','#064e3b'],['Goku','m','#fb923c','#1e3a8a'],['Satoru Gojo','m','#60a5fa','#1e1b4b'],['Hinata','f','#a78bfa','#312e81'],['Konan','f','#38bdf8','#4c1d95'],['Nami','f','#fb923c','#064e3b'],['Mikasa','f','#f87171','#1f2937'],['Makima','f','#f43f5e','#450a0a']];
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
function DP(){return{lang:'sub',srv:0,auto:true,q:'Auto',notif:true,theme:'auto',saver:false}}
var USERS=ls('akUsers')||{},U=USERS[ls('akCur')]||null;
function save(){if(U){USERS[U.email]=U;ls('akUsers',USERS);ls('akCur',U.email)}}
function toast(x){var el=document.getElementById('toast');el.textContent=x;el.className='on';clearTimeout(toast.t);toast.t=setTimeout(function(){el.className=''},3200)}
function av(u,sz){var s='width:'+sz+'px;height:'+sz+'px';if(u.photo)return '<span class="av" style="'+s+'"><img src="'+esc(u.photo)+'" alt=""></span>';var a=AV[u.avatar||0];return '<span class="av" style="'+s+';background:radial-gradient(circle at 30% 20%,'+a[2]+','+a[3]+');font-size:'+Math.round(sz*.42)+'px">'+a[0].charAt(0)+'</span>'}
function ub(){var b=document.getElementById('ub');b.innerHTML=U?av(U,36):t('Login');b.className='ub'+(U?' li':'')}
function applyTheme(){var th=U?U.prefs.theme:'auto',r=document.documentElement;if(th==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',th)}
function M(h){var c=document.getElementById('mc');c.innerHTML=h;document.getElementById('mw').classList.add('on');document.body.style.overflow='hidden';c.scrollTop=0}
function closeM(){document.getElementById('mw').classList.remove('on');document.body.style.overflow=''}
function userBtn(){U?profileView():authView('in')}
function setUser(e,n,ph){U=USERS[e]||{email:e,name:n||e.split('@')[0],joined:Date.now(),avatar:0,photo:'',prefs:DP(),list:[],hist:[]};if(ph){U.gphoto=ph;if(!U.photo)U.photo=ph}save();ub();applyTheme();decorate();closeM()}
var AM='in';
function authView(m){AM=m||AM;var up=AM==='up';M('<button class="sh-x" onclick="closeM()" aria-label="Close">✕</button><div class="mb"><div class="logo brand"><svg class="mk" viewBox="0 0 48 48" aria-hidden="true"><use href="#ak"/></svg><span class="wm"><span class="nm"><span class="gold">Anbu</span>Kai</span><small>ANIME</small></span></div><h2>'+t(up?'Create account':'Welcome back')+'</h2><button class="gbtn" onclick="gLogin()"><b>G</b> '+t('Continue with Google')+'</button><div class="or">'+t('or continue with email')+'</div>'+(up?'<input id="an" class="fi" placeholder="'+esc(t('Your name'))+'">':'')+'<input id="ae" class="fi" type="email" placeholder="'+esc(t('Email'))+'" autocomplete="email"><input id="ap" class="fi" type="password" placeholder="'+esc(t('Password (min 6 characters)'))+'" autocomplete="'+(up?'new':'current')+'-password"><div id="aerr" class="err"></div><button class="btn full" onclick="emailAuth()">'+t(up?'Sign up':'Login')+'</button><p class="sw">'+(up?t('Already have an account?')+' <a onclick="authView(\'in\')">'+t('Login')+'</a>':t('New here?')+' <a onclick="authView(\'up\')">'+t('Sign up')+'</a>')+'</p></div>')}
async function sha(s){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}
function fbInit(){return new Promise(function(ok,no){if(window.firebase&&firebase.apps.length)return ok();var b='https://www.gstatic.com/firebasejs/10.12.2/';function ld(f,cb){var s=document.createElement('script');s.src=b+f;s.onload=cb;s.onerror=no;document.head.appendChild(s)}ld('firebase-app-compat.js',function(){ld('firebase-auth-compat.js',function(){firebase.initializeApp(FIREBASE_CONFIG);ok()})})})}
async function gLogin(){if(FIREBASE_CONFIG){try{await fbInit();var r=await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());setUser(r.user.email,r.user.displayName,r.user.photoURL)}catch(x){toast(x.message)}return}setUser('demo.google@gmail.com','Google User');toast(t('Demo mode: add FIREBASE_CONFIG for real Google login'))}
async function emailAuth(){var e=document.getElementById('ae').value.trim().toLowerCase(),p=document.getElementById('ap').value,n=(document.getElementById('an')||{}).value,er=document.getElementById('aerr');if(!/^\S+@\S+\.\S+$/.test(e)){er.textContent=t('Enter a valid email');return}if(p.length<6){er.textContent=t('Password must be at least 6 characters');return}
if(FIREBASE_CONFIG){try{await fbInit();var a=firebase.auth(),r=AM==='up'?await a.createUserWithEmailAndPassword(e,p):await a.signInWithEmailAndPassword(e,p);setUser(e,n||r.user.displayName,r.user.photoURL)}catch(x){er.textContent=x.message}return}
var h=await sha(e+p);if(AM==='up'){if(USERS[e]){er.textContent=t('This email is already registered');return}USERS[e]={email:e,name:n||e.split('@')[0],joined:Date.now(),avatar:0,photo:'',prefs:DP(),list:[],hist:[],h:h};setUser(e)}else{if(!USERS[e]||USERS[e].h!==h){er.textContent=t('Incorrect email or password');return}setUser(e)}}
function logout(){U=null;try{localStorage.removeItem('akCur')}catch(e){}ub();applyTheme();decorate();closeM();toast(t('Logged out'))}
function delAcc(){if(confirm(t('Delete your account?'))){delete USERS[U.email];ls('akUsers',USERS);logout()}}
function rw(l,h){return '<div class="rw"><span>'+t(l)+'</span>'+h+'</div>'}
function seg(k,o,c){return '<div class="seg">'+o.map(function(x){return '<button class="'+(String(x[0])===String(c)?'on':'')+'" onclick="pref(\''+k+'\',\''+x[0]+'\')">'+esc(t(x[1]))+'</button>'}).join('')+'</div>'}
function tg(k,l){return '<div class="pr"><b>'+t(l)+'</b><button class="sw2 '+(U.prefs[k]?'on':'')+'" onclick="pref(\''+k+'\',\'t\')" aria-label="'+esc(t(l))+'"></button></div>'}
function pref(k,v){if(v==='t')v=!U.prefs[k];else if(k==='srv')v=+v;U.prefs[k]=v;save();if(k==='theme')applyTheme();var c=document.getElementById('mc'),s=c.scrollTop;profileView();c.scrollTop=s}
function saveName(){var v=document.getElementById('pn').value.trim();if(v){U.name=v;save();toast(t('Saved ✓'));profileView()}}
function openByName(n){var i=ALL.findIndex(function(a){return a[1]===n});if(i>-1){closeM();openSheet(i)}}

/* ---- website language (Japanese / English / Bangla) ---- */
function setUILang(code){
  var c=document.getElementById('mc'),s=c?c.scrollTop:0;
  I18N.set(code);
  ub();
  if(U){profileView();if(c)c.scrollTop=s}
  toast(t('Language changed'));
}
function langTiles(){
  var cur=I18N.get();
  return '<div class="ul-grid">'+I18N.langs.map(function(l){
    return '<button class="ul'+(l[0]===cur?' on':'')+'" onclick="setUILang(\''+l[0]+'\')" aria-pressed="'+(l[0]===cur)+'"><span class="fl" aria-hidden="true">'+l[3]+'</span><b>'+l[1]+'</b><small>'+l[2]+'</small></button>';
  }).join('')+'</div>';
}

/* ---- premium profile ---- */
function pcard(icon,title,body){return '<div class="pfx-c"><h4><i aria-hidden="true">'+icon+'</i>'+esc(t(title))+'</h4>'+body+'</div>'}
function profileView(){
  if(!U)return authView();
  var p=U.prefs;
  if(p.lang!=='sub'&&p.lang!=='dub')p.lang='sub'; /* old Hindi/Bangla setting -> Sub */
  var hr=Math.round(U.hist.length*24/6)/10;
  var lg=I18N.get();
  var since=new Date(U.joined).toLocaleDateString(lg==='ja'?'ja-JP':lg==='bn'?'bn-BD':'en',{month:'short',year:'numeric'});

  var top='<div class="pfx"><div class="pfx-cover"><button class="sh-x" onclick="closeM()" aria-label="Close">✕</button></div>'
    +'<div class="pfx-head"><div class="ring" onclick="avPick()">'+av(U,96)+'<i>✎</i></div><h2>'+esc(U.name)+'</h2><small>'+esc(U.email)+'</small><br><span class="pill">★ '+esc(t('Member since {d}',{d:since}))+'</span></div>'
    +'<div class="pfx-stats"><div class="pfx-st"><i aria-hidden="true">♥</i><b>'+U.list.length+'</b><span>'+esc(t('My List'))+'</span></div><div class="pfx-st"><i aria-hidden="true">▶</i><b>'+U.hist.length+'</b><span>'+esc(t('Watched'))+'</span></div><div class="pfx-st"><i aria-hidden="true">◷</i><b>'+hr+'h</b><span>'+esc(t('Watch time'))+'</span></div></div>';

  var profile=pcard('☺','PROFILE','<div class="pr"><input id="pn" class="fi" value="'+esc(U.name)+'"><button class="btn sm" onclick="saveName()">'+esc(t('Save'))+'</button></div><button class="lnk" onclick="avPick()">🖼 '+esc(t('Change avatar / photo'))+'</button>');

  var language=pcard('文','WEBSITE LANGUAGE',langTiles());

  var playback=pcard('▶','PLAYBACK',
    rw('Default language',seg('lang',LANGS,p.lang))
    +rw('Default server',seg('srv',[[0,'Server 01'],[1,'Server 02']],p.srv))
    +rw('Quality',seg('q',[['Auto','Auto'],['1080p','1080p'],['720p','720p'],['480p','480p']],p.q))
    +tg('auto','Autoplay next episode')+tg('saver','Data saver'));

  var app=pcard('◐','APP',
    rw('Theme',seg('theme',[['auto','Auto'],['dark','Dark'],['light','Light']],p.theme))
    +tg('notif','New episode notification'));

  var list=pcard('♥','MY LIST',U.list.length?'<div class="mini">'+U.list.map(function(n){return '<span data-n="'+esc(n)+'" onclick="openByName(this.dataset.n)">'+esc(n)+'</span>'}).join('')+'</div>':'<small class="mu">'+esc(t('Your list is empty'))+'</small>');

  var hist=pcard('◷','WATCH HISTORY',U.hist.length?U.hist.slice(0,6).map(function(h){return '<span class="hi" data-n="'+esc(h.n)+'" onclick="openByName(this.dataset.n)">▶ '+esc(h.n)+' · S'+h.s+' E'+h.e+'</span>'}).join('')+'<button class="lnk" onclick="U.hist=[];save();profileView()">🗑 '+esc(t('Clear history'))+'</button>':'<small class="mu">'+esc(t('Nothing watched yet'))+'</small>');

  var account=pcard('⚙','ACCOUNT','<button class="lnk" onclick="logout()">↪ '+esc(t('Logout'))+'</button><button class="dng" onclick="delAcc()">'+esc(t('Delete account'))+'</button>');

  M(top+profile+language+playback+app+list+hist+account+'</div>');
}

function avPick(g){g=g||'m';var l=AV.map(function(a,i){return[a,i]}).filter(function(x){return x[0][1]===g});M('<button class="sh-x" onclick="profileView()" aria-label="Back">✕</button><div class="mb"><h2>'+esc(t('Choose your avatar'))+'</h2><div class="acts"><label class="btn" for="pf">🖼 '+esc(t('From gallery'))+'</label>'+(U.gphoto?'<button class="btn g" onclick="U.photo=U.gphoto;save();ub();profileView()">'+esc(t('Google photo'))+'</button>':'')+'</div><input id="pf" type="file" accept="image/*" hidden onchange="cropStart(this.files[0])"><div class="seg" style="margin:16px 0 12px;display:inline-flex"><button class="'+(g==='m'?'on':'')+'" onclick="avPick(\'m\')">'+esc(t('Male'))+'</button><button class="'+(g==='f'?'on':'')+'" onclick="avPick(\'f\')">'+esc(t('Female'))+'</button></div><div class="avg">'+l.map(function(x){return '<button class="avb" onclick="U.avatar='+x[1]+';U.photo=\'\';save();ub();profileView()">'+av({avatar:x[1]},64)+'<span>'+x[0][0]+'</span></button>'}).join('')+'</div></div>')}
var CR=null;
function cropStart(f){if(!f)return;var r=new FileReader();r.onload=function(){var im=new Image();im.onload=function(){CR={im:im,z:1,x:0,y:0};cropView()};im.src=r.result};r.readAsDataURL(f)}
function cropGeo(){var b=Math.max(240/CR.im.width,240/CR.im.height)*CR.z,w=CR.im.width*b,h=CR.im.height*b,mx=(w-240)/2,my=(h-240)/2;CR.x=Math.max(-mx,Math.min(mx,CR.x));CR.y=Math.max(-my,Math.min(my,CR.y));return{w:w,h:h,l:(240-w)/2+CR.x,t:(240-h)/2+CR.y}}
function cropDraw(){var g=cropGeo(),i=document.getElementById('ci');i.style.cssText='width:'+g.w+'px;height:'+g.h+'px;left:'+g.l+'px;top:'+g.t+'px'}
function cropView(){M('<button class="sh-x" onclick="avPick()" aria-label="Back">✕</button><div class="mb ctr"><h2>'+esc(t('Adjust your photo'))+'</h2><div class="crop" id="cw"><img id="ci" alt=""></div><small class="mu">'+esc(t('Drag to center your face, use the slider to zoom'))+'</small><input type="range" min="1" max="3" step="0.02" value="1" oninput="CR.z=+this.value;cropDraw()"><button class="btn full" onclick="cropSave()">'+esc(t('Save photo'))+'</button></div>');document.getElementById('ci').src=CR.im.src;cropDraw();var w=document.getElementById('cw'),d=null;w.onpointerdown=function(e){d=[e.clientX,e.clientY,CR.x,CR.y];w.setPointerCapture(e.pointerId)};w.onpointermove=function(e){if(d){CR.x=d[2]+e.clientX-d[0];CR.y=d[3]+e.clientY-d[1];cropDraw()}};w.onpointerup=function(){d=null}}
function cropSave(){var g=cropGeo(),k=256/240,c=document.createElement('canvas');c.width=c.height=256;c.getContext('2d').drawImage(CR.im,g.l*k,g.t*k,g.w*k,g.h*k);U.photo=c.toDataURL('image/jpeg',.85);save();ub();CR=null;profileView()}
/* ---- player v2: season / language / server ---- */