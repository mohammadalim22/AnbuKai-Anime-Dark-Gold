/* ===== AniList API (free, no key) =====
   Home sections + Search + Anime / Movies / My List / Genre pages
   Entry format: [rating, title, 'year • STATUS • Genre', cover, banner, episodes, seasons, description]
   index.html e player.js er PORE load hobe: <script src="anilist.js"></script> */
(function(){
var FIELDS='id title{romaji english}averageScore seasonYear startDate{year}status genres episodes coverImage{large}bannerImage description(asHtml:false)nextAiringEpisode{episode}';
var FR='fragment F on Media{'+FIELDS+'}';
var HQ='query{t:Page(perPage:20){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){...F}}p:Page(perPage:20){media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){...F}}r:Page(perPage:20){media(type:ANIME,sort:SCORE_DESC,isAdult:false){...F}}}'+FR;
var BQ='query($p:Int,$f:[MediaFormat],$g:String,$q:String,$s:[MediaSort]){Page(page:$p,perPage:30){pageInfo{hasNextPage}media(type:ANIME,format_in:$f,genre:$g,search:$q,sort:$s,isAdult:false){...F}}}'+FR;
var SQ='query($s:String){Page(perPage:8){media(type:ANIME,search:$s,sort:SEARCH_MATCH,isAdult:false){...F}}}'+FR;
var ST={RELEASING:'ONGOING',FINISHED:'COMPLETED',NOT_YET_RELEASED:'UPCOMING',CANCELLED:'CANCELLED',HIATUS:'HIATUS'};
var KN=ls('akK')||{},HOME=null,TOK=0,VIEW='home',RES=[],ST_T=0,akExtra=-1;

/* inject grid css (style.css e kichu add korte hobe na) */
var sty=document.createElement('style');
sty.textContent='.gv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 10px;padding:16px 16px 10px}@media(min-width:700px){.gv{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(min-width:1000px){.gv{grid-template-columns:repeat(7,minmax(0,1fr))}}.gv .card{flex:none}.dock a{cursor:pointer}';
document.head.appendChild(sty);

function gql(q,v){
  return fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:q,variables:v||{}})})
  .then(function(r){return r.json()})
  .then(function(j){if(j.errors||!j.data)throw 0;return j.data});
}
function cvt(m){
  var t=m.title.english||m.title.romaji,y=m.seasonYear||(m.startDate&&m.startDate.year)||'',
  r=m.averageScore?(m.averageScore/10).toFixed(1):'N/A',
  ep=m.episodes||(m.nextAiringEpisode?m.nextAiringEpisode.episode-1:0)||12,
  d=(m.description||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(),
  a;
  if(d.length>260)d=d.slice(0,257)+'...';
  EPN[t]=ep;
  a=[r,t,y+' • '+(ST[m.status]||m.status)+' • '+(m.genres&&m.genres[0]||'Anime'),m.coverImage&&m.coverImage.large||'',m.bannerImage||'',ep,1,d];
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
  arrows();decorate();
}

/* ---------- chrome (hero / genre chips / dock) ---------- */
function chrome(h,g){
  document.getElementById('hero').parentNode.style.display=h?'':'none';
  document.getElementById('genres').style.display=g?'':'none';
}
function dock(n){document.querySelectorAll('.dock a').forEach(function(a,i){a.classList.toggle('on',i===n)})}
function chip(n){document.querySelectorAll('#genres span').forEach(function(s,i){s.classList.toggle('on',i===n)})}

/* ---------- Home ---------- */
function showHome(){
  VIEW='home';TOK++;chrome(1,1);dock(0);chip(0);window.scrollTo(0,0);
  if(HOME)buildHome(HOME);else loadHome();
}
function loadHome(){
  var cache=null;try{cache=JSON.parse(sessionStorage.getItem('akAL'))}catch(e){}
  if(cache&&Date.now()-cache.t<6e5){
    cache.d.forEach(function(s){s[2].forEach(function(a){EPN[a[1]]=a[5];KN[a[1]]=a})});
    HOME=cache.d;if(VIEW==='home')buildHome(HOME);return;
  }
  gql(HQ).then(function(d){
    var sets=[['TRENDING','Trending Now',d.t.media.map(cvt)],['TOP 10','Top Rated',d.r.media.map(cvt)],['FAN FAVORITES','Popular',d.p.media.map(cvt)]];
    try{sessionStorage.setItem('akAL',JSON.stringify({t:Date.now(),d:sets}))}catch(e){}
    saveKN();HOME=sets;
    if(VIEW==='home')buildHome(sets);
  }).catch(function(){});
}

/* ---------- Grid pages: Anime / Movies / Genre ---------- */
function browse(o){
  var app=document.getElementById('app'),pg=0,tok=++TOK;
  VIEW='b';chrome(0,o.chips);dock(o.dock);resetAll();window.scrollTo(0,0);
  app.innerHTML='<section><div class="head"><div><small>'+o.label+'</small><h2>'+esc(o.title)+'</h2></div></div><div class="gv" id="gv"></div><p class="mu" id="gs" style="text-align:center;padding:14px">Loading...</p><div style="text-align:center"><button class="btn" id="lm" style="display:none">Load more</button></div></section>';
  var gv=document.getElementById('gv'),gs=document.getElementById('gs'),lm=document.getElementById('lm');
  function more(){
    pg++;gs.textContent='Loading...';lm.style.display='none';
    gql(BQ,{p:pg,f:o.f||null,g:o.g||null,q:o.q||null,s:[o.q?'SEARCH_MATCH':'POPULARITY_DESC']}).then(function(d){
      if(tok!==TOK)return;
      var P=d.Page,h='';
      P.media.forEach(function(m){var a=cvt(m);h+=cardH(a,ALL.push(a)-1)});
      gv.insertAdjacentHTML('beforeend',h);saveKN();decorate();
      gs.textContent=(pg===1&&!P.media.length)?'No anime found':'';
      lm.style.display=P.pageInfo.hasNextPage?'':'none';
    }).catch(function(){if(tok===TOK){gs.textContent='Could not load. Check your internet.';lm.style.display='';lm.textContent='Try again';pg--}});
  }
  lm.onclick=more;more();
}
function showAnime(){browse({label:'BROWSE',title:'Anime',f:['TV','TV_SHORT','ONA'],chips:0,dock:1})}
function showMovies(){browse({label:'BROWSE',title:'Movies',f:['MOVIE'],chips:0,dock:2})}
function showGenre(g){browse({label:'GENRE',title:g,g:g,chips:1,dock:0})}

/* ---------- My List ---------- */
function showList(){
  if(!U){authView('in');toast('Login to see My List');return}
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

loadHome();
})();
