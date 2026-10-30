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
function autoHero(){clearInterval(ht);0}
var S=[
['TRENDING','Trending Now',[['8.9','BLEACH: Thousand-Year Blood War','2026 • ONGOING • Action'],['7.9','Black Clover','2017 • COMPLETED • Action'],['7.6','Nia Liston: The Merciless Maiden','2026 • ONGOING • Action'],['8.2','Jujutsu Kaisen','2020 • COMPLETED • Action'],['8.1','Solo Leveling','2024 • ONGOING • Fantasy']]],
['TOP 10','Top Rated',[['9.1','Frieren: Beyond Journey’s End','2023 • COMPLETED • Fantasy'],['9.0','Gintama: THE VERY FINAL','2021 • COMPLETED • Comedy'],['9.0','Gintama Season 3','2015 • COMPLETED • Comedy'],['9.2','Fullmetal Alchemist: Brotherhood','2009 • COMPLETED • Action'],['8.9','Steins;Gate','2011 • COMPLETED • Sci-Fi']]],
['FAN FAVORITES','Popular',[['8.5','Attack on Titan','2013 • COMPLETED • Action'],['8.2','Demon Slayer','2019 • COMPLETED • Action'],['8.4','Jujutsu Kaisen Season 2','2023 • COMPLETED • Action'],['8.7','One Piece','1999 • ONGOING • Adventure'],['8.6','Naruto Shippuden','2007 • COMPLETED • Action']]]
];
