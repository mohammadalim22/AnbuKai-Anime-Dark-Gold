var C=['233,196,106','255,77,109','233,196,106','139,92,246','255,77,109'];
var out='',ALL=[];
S.forEach(function(s,si){
  out+='<section><div class="head"><div><small>'+s[0]+'</small><h2>'+s[1]+'</h2></div><div class="arr"><button data-r="r'+si+'" data-d="-1" aria-label="Previous">‹</button><button data-r="r'+si+'" data-d="1" aria-label="Next">›</button></div></div><div class="row" id="r'+si+'">';
  s[1+1].forEach(function(a,i){
    var c=C[(i+si)%5],x=55+((si*2+i)*19)%40;
    ALL.push(a);out+='<div class="card" onclick="openSheet('+(ALL.length-1)+')"><div class="frame"><div class="poster" style="background:radial-gradient(85% 60% at '+x+'% 0%,rgba('+c+',.4),transparent 68%),radial-gradient(60% 45% at 0% 100%,rgba(233,196,106,.14),transparent 70%),#0c0c14"><span class="rate">'+a[0]+'</span>'+(a[2].indexOf('ONGOING')>-1?'<span class="nw">NEW</span>':'')+'<button class="bm" aria-label="Bookmark"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button><span class="l">'+a[1].charAt(0)+'</span></div></div><h3>'+a[1]+'</h3><small>'+a[2]+'</small></div>';
  });
  out+='</div></section>';
});
document.getElementById('app').innerHTML=out;
showHero(0);autoHero();
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});

var GN=['All','Action','Adventure','Romance','Fantasy','Comedy','Horror','Sci-Fi','Mystery','Sports'];
document.getElementById('genres').innerHTML=GN.map(function(g,i){return '<span class="'+(i?'':'on')+'">'+g+'</span>'}).join('');
document.querySelectorAll('#genres span').forEach(function(s){s.onclick=function(){document.querySelectorAll('#genres span').forEach(function(x){x.classList.remove('on')});s.classList.add('on')}});

function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function openSheet(i){
  var a=ALL[i],m=a[2].split(' • '),c=C[i%5],sh=document.getElementById('sheet'),eps='';
  for(var k=1;k<=12;k++)eps+='<button onclick="watch('+i+','+k+')">'+k+'</button>';
  sh.innerHTML='<div class="sh-top" id="shtop" style="background:radial-gradient(85% 70% at 70% 0%,rgba('+c+',.5),transparent 70%),radial-gradient(60% 50% at 0% 100%,rgba(233,196,106,.2),transparent 70%),#0c0c14"><button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button></div><div class="sh-b"><div class="chips"><span class="r">★ '+a[0]+'</span>'+m.map(function(t){return '<span>'+esc(t)+'</span>'}).join('')+'</div><h2>'+esc(a[1])+'</h2><div><button class="btn" onclick="watch('+i+',1)">▶ Watch Now</button><button class="btn g">+ My List</button></div><div id="np"></div><p></p><h4>EPISODES</h4><div class="eps">'+eps+'</div></div>';
  sh.classList.remove('pm');sh.scrollTop=0;sh.classList.add('on');document.getElementById('ov').classList.add('on');document.body.style.overflow='hidden';
}
function closeSheet(){document.querySelectorAll('#sheet video,#sheet iframe').forEach(function(x){x.remove()});document.getElementById('sheet').classList.remove('on');document.getElementById('ov').classList.remove('on');document.body.style.overflow=''}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet()});
var q=document.getElementById('q'),sr=document.getElementById('sr');
q.addEventListener('input',function(){
  var v=q.value.trim().toLowerCase();
  if(!v){sr.className='';sr.innerHTML='';return}
  var r=[];ALL.forEach(function(a,i){if(a[1].toLowerCase().indexOf(v)>-1)r.push(i)});
  sr.className='on';
  sr.innerHTML=r.length?r.slice(0,6).map(function(i){var a=ALL[i];return '<div class="sri" onclick="pick('+i+')"><b>'+esc(a[1])+'</b><span>★ '+a[0]+' · '+esc(a[2])+'</span></div>'}).join(''):'<div class="sri"><span>No results found</span></div>';
});
function pick(i){sr.className='';q.value='';sr.innerHTML='';openSheet(i)}
