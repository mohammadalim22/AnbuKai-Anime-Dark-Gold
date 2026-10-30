/* ===== AniList API (free, no key) =====
   Entry format: [rating, title, 'year • STATUS • Genre', cover, banner, episodes, seasons, description]
   index.html e player.js er PORE load koro: <script src="anilist.js"></script> */
(function(){
var Q='query{t:Page(perPage:20){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){...F}}p:Page(perPage:20){media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){...F}}r:Page(perPage:20){media(type:ANIME,sort:SCORE_DESC,isAdult:false){...F}}}fragment F on Media{id title{romaji english}averageScore seasonYear startDate{year}status genres episodes coverImage{large}bannerImage description(asHtml:false)nextAiringEpisode{episode}}';
var ST={RELEASING:'ONGOING',FINISHED:'COMPLETED',NOT_YET_RELEASED:'UPCOMING',CANCELLED:'CANCELLED',HIATUS:'HIATUS'};
function cvt(m){
  var t=m.title.english||m.title.romaji,y=m.seasonYear||(m.startDate&&m.startDate.year)||'',
  r=m.averageScore?(m.averageScore/10).toFixed(1):'N/A',
  ep=m.episodes||(m.nextAiringEpisode?m.nextAiringEpisode.episode-1:0)||12,
  d=(m.description||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  if(d.length>260)d=d.slice(0,257)+'...';
  EPN[t]=ep;
  return [r,t,y+' • '+(ST[m.status]||m.status)+' • '+(m.genres&&m.genres[0]||'Anime'),m.coverImage&&m.coverImage.large||'',m.bannerImage||'',ep,1,d];
}
function cu(u){return encodeURI(u).replace(/[()']/g,function(c){return '%'+c.charCodeAt(0).toString(16)})}
function build(sets){
  var out='';ALL.length=0;
  sets.forEach(function(s,si){
    out+='<section><div class="head"><div><small>'+s[0]+'</small><h2>'+s[1]+'</h2></div><div class="arr"><button data-r="r'+si+'" data-d="-1" aria-label="Previous">‹</button><button data-r="r'+si+'" data-d="1" aria-label="Next">›</button></div></div><div class="row" id="r'+si+'">';
    s[2].forEach(function(a,i){
      var c=C[(i+si)%5];
      ALL.push(a);
      out+='<div class="card" onclick="openSheet('+(ALL.length-1)+')"><div class="frame"><div class="poster" style="background:radial-gradient(85% 60% at 60% 0%,rgba('+c+',.4),transparent 68%),#0c0c14">'+(a[3]?'<img class="pi" loading="lazy" alt="" src="'+esc(a[3])+'">':'')+'<span class="rate">'+a[0]+'</span>'+(a[2].indexOf('ONGOING')>-1?'<span class="nw">NEW</span>':'')+'<button class="bm" aria-label="Bookmark"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button><span class="l">'+esc(a[1].charAt(0))+'</span></div></div><h3>'+esc(a[1])+'</h3><small>'+esc(a[2])+'</small></div>';
    });
    out+='</div></section>';
  });
  document.getElementById('app').innerHTML=out;
  document.querySelectorAll('.arr button').forEach(function(b){
    b.onclick=function(){var r=document.getElementById(b.dataset.r);r.scrollBy({left:b.dataset.d*r.clientWidth*.9,behavior:'smooth'})};
  });
  decorate();
}
function load(){
  var cache=null;try{cache=JSON.parse(sessionStorage.getItem('akAL'))}catch(e){}
  if(cache&&Date.now()-cache.t<6e5){cache.d.forEach(function(s){s[2].forEach(function(a){EPN[a[1]]=a[5]})});build(cache.d);return}
  fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:Q})})
  .then(function(r){if(!r.ok)throw 0;return r.json()})
  .then(function(j){
    var d=j.data,sets=[['TRENDING','Trending Now',d.t.media.map(cvt)],['TOP 10','Top Rated',d.r.media.map(cvt)],['FAN FAVORITES','Popular',d.p.media.map(cvt)]];
    try{sessionStorage.setItem('akAL',JSON.stringify({t:Date.now(),d:sets}))}catch(e){}
    build(sets);
  })
  .catch(function(){/* fail hole puran static data thakbe */});
}
load();
})();
