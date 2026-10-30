/* ===== AniList API (free, no key) =====
   Home sections + Search + Anime / Movies / My List / Genre pages
   Entry format: [rating, title, 'year • STATUS • Genre', cover, banner, episodes, seasons, description]
   index.html e player.js er PORE load hobe: <script src="anilist.js"></script> */
(function(){
var FIELDS='id title{romaji english}averageScore seasonYear startDate{year}status format duration genres episodes coverImage{large}bannerImage description(asHtml:false)nextAiringEpisode{episode}';
var FR='fragment F on Media{'+FIELDS+'}';
var HQ='query{t:Page(perPage:20){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){...F}}p:Page(perPage:20){media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){...F}}r:Page(perPage:20){media(type:ANIME,sort:SCORE_DESC,isAdult:false){...F}}}'+FR;
function bq(o){
  var a='type:ANIME,isAdult:false,sort:'+(o.q?'SEARCH_MATCH':'POPULARITY_DESC');
  if(o.f)a+=',format_in:['+o.f.join(',')+']';
  if(o.g)a+=',genre:"'+String(o.g).replace(/["\\]/g,'')+'"';
  if(o.q)a+=',search:$q';
  return 'query($p:Int'+(o.q?',$q:String':'')+'){Page(page:$p,perPage:30){pageInfo{hasNextPage}media('+a+'){...F}}}'+FR;
}
var SQ='query($s:String){Page(perPage:8){media(type:ANIME,search:$s,sort:SEARCH_MATCH,isAdult:false){...F}}}'+FR;
var ST={RELEASING:'ONGOING',FINISHED:'COMPLETED',NOT_YET_RELEASED:'UPCOMING',CANCELLED:'CANCELLED',HIATUS:'HIATUS'};
var KN=ls('akK')||{},HOME=null,TOK=0,VIEW='home',RES=[],ST_T=0,akExtra=-1;

/* inject grid css (style.css e kichu add korte hobe na) */
var sty=document.createElement('style');
sty.textContent='.gv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 10px;padding:16px 16px 10px}@media(min-width:700px){.gv{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(min-width:1000px){.gv{grid-template-columns:repeat(7,minmax(0,1fr))}}.gv .card{flex:none}.dock a{cursor:pointer}'
+'.sh-top.pl{position:sticky;top:0;z-index:6}'
+'@media(max-width:699px){#sheet{left:0;top:0;bottom:0;width:100%;max-height:none;height:100vh;height:100dvh;transform:translateY(105%);border:0;border-radius:0}#sheet.on{transform:translateY(0)}#sheet .sh-top,#sheet .sh-top.pl{border-radius:0}}'
+'.akh{position:relative;border-radius:21px;overflow:hidden;background:#0c0c14;color:#f5f1e8}'
+'.akh-bg{position:absolute;inset:0;background-size:cover;background-position:center;animation:akf .6s ease}'
+'@keyframes akf{from{opacity:0}to{opacity:1}}'
+'.akh-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,6,10,.94),rgba(6,6,10,.78) 55%,rgba(6,6,10,.55))}'
+'.akh-c{position:relative;z-index:2;display:flex;gap:12px;align-items:center;padding:14px 14px 2px}'
+'.akh-p{flex:none;width:92px;aspect-ratio:2/3;object-fit:cover;border-radius:12px;border:1px solid rgba(233,196,106,.5);box-shadow:0 8px 20px -6px rgba(0,0,0,.7);background:#14141f}'
+'.akh-i{min-width:0;flex:1}'
+'.akh-sp{display:flex;align-items:center;gap:6px;font:700 .6rem Sora,sans-serif;letter-spacing:.16em;color:#e9c46a;margin-bottom:5px}'
+'.akh-sp i{width:6px;height:6px;border-radius:50%;background:#ff4d6d}'
+'.akh-t{font:800 1.02rem/1.22 Sora,sans-serif;letter-spacing:-.02em;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}'
+'.akh-m{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}'
+'.akh-m span{padding:2px 8px;border-radius:7px;font-size:.66rem;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14)}'
+'.akh-m .r{color:#e9c46a;font-weight:700}'
+'.akh-b{display:flex;gap:6px;flex-wrap:wrap}'
+'.akh-b .btn{padding:8px 13px;font-size:.72rem}'
+'.akh-b .btn.g{margin-left:0;color:#f5f1e8;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}'
+'.akh-d{position:relative;z-index:3;display:flex;gap:6px;padding:8px 14px 12px}'
+'.akh-d span{width:7px;height:7px;border-radius:99px;background:rgba(255,255,255,.35);cursor:pointer;transition:width .25s}'
+'.akh-d span.on{width:22px;background:#e9c46a}';
document.head.appendChild(sty);

function gql(q,v){
  return fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:q,variables:v||{}})})
  .then(function(r){return r.json()})
  .then(function(j){if(j.errors||!j.data)throw new Error(j.errors&&j.errors[0]&&j.errors[0].message||'No data');return j.data});
}
function fm(f){return f==='MOVIE'?'Movie':f==='TV_SHORT'?'TV Short':f||'TV'}
function cvt(m){
  var t=m.title.english||m.title.romaji,y=m.seasonYear||(m.startDate&&m.startDate.year)||'',
  r=m.averageScore?(m.averageScore/10).toFixed(1):'N/A',
  ep=m.episodes||(m.nextAiringEpisode?m.nextAiringEpisode.episode-1:0)||12,
  d=(m.description||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(),
  a;
  if(d.length>260)d=d.slice(0,257)+'...';
  EPN[t]=ep;
  a=[r,t,y+' • '+(ST[m.status]||m.status)+' • '+(m.genres&&m.genres[0]||'Anime'),m.coverImage&&m.coverImage.large||'',m.bannerImage||'',ep,1,d,fm(m.format),m.duration||0];
  KN[t]=a;
  return a;
}
function saveKN(){
  var k=Object.keys(KN);
  if(k.length>250){k.slice(0,k.length-250).forEach(function(x){delete KN[x]})}
  ls('akK',KN);
}
function resetAll(){ALL.length=0;akExtra=-1}
function cardH(a,i){
  var c=C[i%5],x=55+((i*19)%40);
  return '<div class="card" onclick="openSheet('+i+')"><div class="frame"><div class="poster" style="background:radial-gradient(85% 60% at '+x+'% 0%,rgba('+c+',.4),transparent 68%),#0c0c14">'+(a[3]?'<img class="pi" loading="lazy" alt="" src="'+esc(a[3])+'">':'')+'<span class="rate">'+a[0]+'</span>'+(a[2].indexOf('ONGOING')>-1?'<span class="nw">NEW</span>':'')+'<button class="bm" aria-label="Bookmark"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button><span class="l">'+esc(a[1].charAt(0))+'</span></div></div><h3>'+esc(a[1])+'</h3><small>'+esc(a[2])+'</small></div>';
}
function arrows(){
  document.querySelectorAll('.arr button').forEach(function(b){
    b.onclick=function(){var r=document.getElementById(b.dataset.r);r.scrollBy({left:b.dataset.d*r.clientWidth*.9,behavior:'smooth'})};
  });
}
function buildHome(sets){
  var out='';resetAll();
  sets.forEach(function(s,si){
    out+='<section><div class="head"><div><small>'+s[0]+'</small><h2>'+s[1]+'</h2></div><div class="arr"><button data-r="r'+si+'" data-d="-1" aria-label="Previous">‹</button><button data-r="r'+si+'" data-d="1" aria-label="Next">›</button></div></div><div class="row" id="r'+si+'">';
    s[2].forEach(function(a){out+=cardH(a,ALL.push(a)-1)});
    out+='</div></section>';
  });
  document.getElementById('app').innerHTML=out;
  arrows();decorate();initHero(sets);
}

/* ---------- chrome (hero / genre chips / dock) ---------- */
function chrome(h,g){
  heroWrap().style.display=h?'':'none';
  document.getElementById('genres').style.display=g?'':'none';
}
function dock(n){document.querySelectorAll('.dock a').forEach(function(a,i){a.classList.toggle('on',i===n)})}
function chip(n){document.querySelectorAll('#genres span').forEach(function(s,i){s.classList.toggle('on',i===n)})}

/* ---------- Home ---------- */
function showHome(){
  nv({p:'home'});
  VIEW='home';TOK++;chrome(1,1);dock(0);chip(0);window.scrollTo(0,0);
  if(HOME)buildHome(HOME);else loadHome();
}
function loadHome(){
  var cache=null;try{cache=JSON.parse(sessionStorage.getItem('akAL2'))}catch(e){}
  if(cache&&Date.now()-cache.t<6e5){
    cache.d.forEach(function(s){s[2].forEach(function(a){EPN[a[1]]=a[5];KN[a[1]]=a})});
    HOME=cache.d;initHero(HOME);if(VIEW==='home')buildHome(HOME);return;
  }
  gql(HQ).then(function(d){
    var sets=[['TRENDING','Trending Now',d.t.media.map(cvt)],['TOP 10','Top Rated',d.r.media.map(cvt)],['FAN FAVORITES','Popular',d.p.media.map(cvt)]];
    try{sessionStorage.setItem('akAL2',JSON.stringify({t:Date.now(),d:sets}))}catch(e){}
    saveKN();HOME=sets;initHero(sets);
    if(VIEW==='home')buildHome(sets);
  }).catch(function(){});
}

/* ---------- Grid pages: Anime / Movies / Genre ---------- */
function browse(o){
  nv({p:'b',o:o});
  var app=document.getElementById('app'),pg=0,tok=++TOK;
  VIEW='b';chrome(0,o.chips);dock(o.dock);resetAll();window.scrollTo(0,0);
  app.innerHTML='<section><div class="head"><div><small>'+o.label+'</small><h2>'+esc(o.title)+'</h2></div></div><div class="gv" id="gv"></div><p class="mu" id="gs" style="text-align:center;padding:14px">Loading...</p><div style="text-align:center"><button class="btn" id="lm" style="display:none">Load more</button></div></section>';
  var gv=document.getElementById('gv'),gs=document.getElementById('gs'),lm=document.getElementById('lm');
  function more(){
    pg++;gs.textContent='Loading...';lm.style.display='none';
    var vars={p:pg};if(o.q)vars.q=o.q;
    gql(bq(o),vars).then(function(d){
      if(tok!==TOK)return;
      var P=d.Page,h='';
      P.media.forEach(function(m){var a=cvt(m);h+=cardH(a,ALL.push(a)-1)});
      gv.insertAdjacentHTML('beforeend',h);saveKN();decorate();
      gs.textContent=(pg===1&&!P.media.length)?'No anime found':'';
      lm.style.display=P.pageInfo.hasNextPage?'':'none';
    }).catch(function(e){if(tok===TOK){gs.textContent='Could not load: '+(e&&e.message||e);lm.style.display='';lm.textContent='Try again';pg--}});
  }
  lm.onclick=more;more();
}
function showAnime(){browse({label:'BROWSE',title:'Anime',f:['TV','TV_SHORT','ONA'],chips:0,dock:1})}
function showMovies(){browse({label:'BROWSE',title:'Movies',f:['MOVIE'],chips:0,dock:2})}
function showGenre(g){browse({label:'GENRE',title:g,g:g,chips:1,dock:0})}

/* ---------- My List ---------- */
function showList(){
  if(!U){authView('in');toast('Login to see My List');return}
  nv({p:'l'});
  VIEW='l';TOK++;chrome(0,0);dock(3);resetAll();window.scrollTo(0,0);
  var L=U.list.map(function(n){return KN[n]}).filter(Boolean),h='';
  L.forEach(function(a){h+=cardH(a,ALL.push(a)-1)});
  document.getElementById('app').innerHTML='<section><div class="head"><div><small>SAVED</small><h2>My List</h2></div></div>'+(L.length?'<div class="gv">'+h+'</div>':'<p class="mu" style="text-align:center;padding:40px 16px">Your list is empty. Tap the bookmark on any anime to add it.</p>')+'</section>';
  decorate();
}

/* ---------- dock + genre chips ---------- */
var acts=[showHome,showAnime,showMovies,showList];
document.querySelectorAll('.dock a').forEach(function(a,i){
  a.onclick=function(e){e.preventDefault();acts[i]()};
});
document.querySelectorAll('#genres span').forEach(function(s,i){
  s.onclick=function(){chip(i);if(!i)showHome();else showGenre(s.textContent.trim())};
});

/* ---------- Search (AniList theke, sob anime) ---------- */
var qi=document.getElementById('q'),nq=qi.cloneNode(true);
qi.parentNode.replaceChild(nq,qi);q=nq;
nq.addEventListener('input',function(){
  var v=nq.value.trim();clearTimeout(ST_T);
  if(!v){sr.className='';sr.innerHTML='';return}
  sr.className='on';sr.innerHTML='<div class="sri"><span>Searching...</span></div>';
  ST_T=setTimeout(function(){
    gql(SQ,{s:v}).then(function(d){
      if(nq.value.trim()!==v)return;
      RES=d.Page.media.map(cvt);saveKN();
      sr.className='on';
      sr.innerHTML=RES.length?RES.map(function(a,i){return '<div class="sri" onclick="akPick('+i+')"><b>'+esc(a[1])+'</b><span>★ '+a[0]+' · '+esc(a[2])+'</span></div>'}).join(''):'<div class="sri"><span>No results found</span></div>';
    }).catch(function(){
      if(nq.value.trim()!==v)return;
      RES=ALL.filter(function(a){return a[1].toLowerCase().indexOf(v.toLowerCase())>-1}).slice(0,6);
      sr.innerHTML=RES.length?RES.map(function(a,i){return '<div class="sri" onclick="akPick('+i+')"><b>'+esc(a[1])+'</b><span>★ '+a[0]+' · '+esc(a[2])+'</span></div>'}).join(''):'<div class="sri"><span>Search failed. Check your internet.</span></div>';
    });
  },350);
});
function openEntry(a){
  var k=ALL.findIndex(function(x){return x[1]===a[1]});
  if(k<0){k=ALL.push(a)-1;akExtra=k}
  openSheet(k);
}
window.akPick=function(i){var a=RES[i];if(!a)return;sr.className='';nq.value='';sr.innerHTML='';openEntry(a)};
window.openByName=function(n){var a=KN[n]||ALL.filter(function(x){return x[1]===n})[0];if(a){closeM();openEntry(a)}};
/* Go/Enter ba 🔍 tap korle full search result page */
function doSearch(){
  var v=nq.value.trim();
  if(!v){nq.focus();return}
  clearTimeout(ST_T);sr.className='';sr.innerHTML='';nq.blur();
  browse({label:'SEARCH',title:'Results for "'+v+'"',q:v,chips:0,dock:-1});
}
nq.setAttribute('enterkeyhint','search');
nq.addEventListener('keydown',function(e){if(e.key==='Enter'||e.keyCode===13){e.preventDefault();doSearch()}});
var mg=document.querySelector('.search span');
if(mg){mg.style.cursor='pointer';mg.onclick=doSearch}
var oc=closeSheet;
window.closeSheet=function(){oc();if(akExtra>-1&&akExtra===ALL.length-1)ALL.pop();akExtra=-1};

/* ---------- Hero (AniList trending banner, auto slide + swipe) ---------- */
var HERO=[],HI=0,newW=null,oldW=document.getElementById('hero').parentNode;
function heroWrap(){return newW||oldW}
function initHero(sets){
  var l=sets[0][2].filter(function(a){return a[4]}).slice(0,5);
  if(!l.length)return;
  HERO=l;
  if(!newW){
    newW=document.createElement('div');newW.className='frame';newW.style.margin='16px 16px 0';
    newW.innerHTML='<div class="akh" id="akh"></div>';
    oldW.parentNode.insertBefore(newW,oldW);oldW.style.display='none';
    newW.style.display=VIEW==='home'?'':'none';
    var sx=0;
    newW.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});
    newW.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)heroGo(HI+(dx<0?1:-1))},{passive:true});
    setInterval(function(){
      if(VIEW==='home'&&!document.getElementById('sheet').classList.contains('on')&&!document.getElementById('mw').classList.contains('on'))heroGo(HI+1);
    },6000);
  }
  heroGo(HI);
}
function heroGo(i){HI=(i+HERO.length)%HERO.length;heroDraw()}
function heroDraw(){
  var a=HERO[HI],m=a[2].split(' • '),i,dots='',inl=!!U&&U.list.indexOf(a[1])>-1;
  for(i=0;i<HERO.length;i++)dots+='<span class="'+(i===HI?'on':'')+'" onclick="akHG('+i+')"></span>';
  document.getElementById('akh').innerHTML='<div class="akh-bg" style="background-image:url('+cu(a[4])+')"></div><div class="akh-shade"></div><div class="akh-c">'+(a[3]?'<img class="akh-p" alt="" src="'+esc(a[3])+'">':'')+'<div class="akh-i"><div class="akh-sp"><i></i>#'+(HI+1)+' SPOTLIGHT</div><h1 class="akh-t">'+esc(a[1])+'</h1><div class="akh-m"><span class="r">★ '+a[0]+'</span><span>'+esc(a[8]||'TV')+'</span>'+(a[9]?'<span>'+a[9]+' min</span>':'')+'<span>'+esc(m[1]||'')+'</span></div><div class="akh-b"><button class="btn" onclick="akHP()">▶ Watch Now</button><button class="btn g" onclick="akHL()">'+(inl?'✓ In My List':'+ My List')+'</button></div></div></div><div class="akh-d">'+dots+'</div>';
}
window.akHG=heroGo;
window.akHP=function(){openEntry(HERO[HI]);play()};
window.akHL=function(){toggleList(HERO[HI][1]);heroDraw()};

/* ---------- Back button support (nav.js er sathe) ---------- */
var NV=0;
function nv(s){if(!NV&&window.akPush)window.akPush(s)}
window.akGo=function(s){NV=1;try{
  if(s.p==='home')showHome();
  else if(s.p==='l')showList();
  else if(s.p==='b'){
    browse(s.o);
    if(s.o.g){document.querySelectorAll('#genres span').forEach(function(x,i){if(x.textContent.trim()===s.o.g)chip(i)})}
  }
}finally{NV=0}};

loadHome();
})();
