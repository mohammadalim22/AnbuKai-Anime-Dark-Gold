/* ===== HERO SETTINGS: ekhane hero edit koro. img e image er link/path dao ===== */
var HERO=[
{title:'Shadow Blade',accent:'Chronicles',rating:'9.2',tags:['TV','24 min','HD','SUB | DUB'],desc:'A mysterious warrior, a lost empire and an endless war.',img:'',link:'#'},
{title:'Moonlit',accent:'Ronin',rating:'8.8',tags:['TV','23 min','HD','SUB'],desc:'A lonely samurai’s journey beneath the moonlight.',img:'',link:'#'},
{title:'Crimson',accent:'Academy',rating:'8.5',tags:['TV','24 min','HD','SUB | DUB'],desc:'A secret academy and a terrifying mystery.',img:'',link:'#'}
];
var hi=0,ht;
function showHero(i){
  hi=(i+HERO.length)%HERO.length;
  var h=HERO[hi],el=document.getElementById('hero');
  if(h.img){el.style.backgroundImage='linear-gradient(90deg,rgba(6,6,10,.94),rgba(6,6,10,.3)),url('+h.img+')';el.style.backgroundSize='cover';el.style.backgroundPosition='center'}else{el.style.backgroundImage='';el.style.backgroundSize=''}
  el.innerHTML='<span class="eyebrow">#'+(hi+1)+' SPOTLIGHT</span><h1>'+h.title+' <span class="gold">'+h.accent+'</span></h1><div class="chips"><span class="r">★ '+h.rating+'</span>'+h.tags.map(function(t){return '<span>'+t+'</span>'}).join('')+'</div><p>'+h.desc+'</p><a class="btn" href="'+h.link+'">▶ Watch Now</a><button class="btn g">+ My List</button><div class="dots">'+HERO.map(function(_,k){return '<i class="'+(k===hi?'on':'')+'" onclick="showHero('+k+');autoHero()"></i>'}).join('')+'</div>';
}
function autoHero(){clearInterval(ht)}
