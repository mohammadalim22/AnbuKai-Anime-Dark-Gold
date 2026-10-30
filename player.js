document.addEventListener('click',function(e){if(!e.target.closest('.search'))sr.className=''});

document.querySelectorAll('.arr button').forEach(function(b){
  b.onclick=function(){var r=document.getElementById(b.dataset.r);r.scrollBy({left:b.dataset.d*r.clientWidth*.9,behavior:'smooth'})};
});
document.querySelectorAll('.bm').forEach(function(b){
  b.onclick=function(e){e.stopPropagation();b.classList.toggle('on')};
});
var SH={};
var PG=100;

// 🚨 সব সার্ভার চেক করার আপডেট করা ফাংশন 🚨
async function getStream(anilistId, episode, type){
  // একাধিক সার্ভারের লিস্ট (যেকোনো একটা কাজ করলেই হবে)
  const providers = ["anikoto", "reanime", "kaa", "senshi", "anizone", "aniwaves", "mkissa"];
  const baseUrl = "https://anivexa-api-wi89.onrender.com";
  const audio = type === 'dub' ? 'dub' : 'sub';

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const epId = `${provider}-${episode}`;
      // API-এর সঠিক রাউট: /watch/provider/anilistId/audio/epId
      const apiUrl = `${baseUrl}/watch/${provider}/${anilistId}/${audio}/${epId}`;
      
      const response = await fetch(apiUrl);
      
      // যদি সার্ভার রেসপন্স না দেয়, তবে পরের সার্ভারে যাবে
      if (!response.ok) continue; 

      const data = await response.json();
      
      // যদি ডাটা পাওয়া যায়
      if (data && data.sources && data.sources.length > 0) {
        const m3u8 = data.sources.find(s => s.url.includes('.m3u8'));
        if (m3u8) return m3u8.url;
        return data.sources[0].url;
      }
      if (data && data.url) return data.url;
      
    } catch (error) {
      console.log(`Server ${provider} failed, trying next...`);
    }
  }
  return null; // কোনো সার্ভারেই না পেলে null
}

function hasVid(n){var a=VIDEOS[n];return !!a&&Object.keys(a).length>0}
function vurl(n,s,e,l,v){var a=VIDEOS[n],x=a&&a[s]&&a[s][e]&&a[s][e][l];return x&&x[v]||''}
function cu(u){return encodeURI(u).replace(/[()']/g,function(c){return '%'+c.charCodeAt(0).toString(16)})}

function openSheet(i){
  var a=ALL[i],p=U?U.prefs:DP(),c=C[i%5],m=a[2].split(' • '),sh=document.getElementById('sheet'),bn=a[4]||a[3];
  SH={i:i,s:1,e:1,l:p.lang,v:p.srv,play:0,pg:0};
  var bg=bn?'linear-gradient(to top,rgba(12,12,20,.3),transparent),url('+cu(bn)+') center/cover,#0c0c14':'radial-gradient(85% 70% at 70% 0%,rgba('+c+',.5),transparent 70%),radial-gradient(60% 50% at 0% 100%,rgba(233,196,106,.2),transparent 70%),#0c0c14';
  sh.innerHTML='<div class="sh-top" id="shtop" style="background:'+bg+'"><button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button></div><div class="sh-b"><div class="chips"><span class="r">★ '+a[0]+'</span>'+m.map(function(t){return '<span>'+esc(t)+'</span>'}).join('')+'</div><h2>'+esc(a[1])+'</h2>'+(a[7]?'<p class="ds">'+esc(a[7])+'</p>':'')+'<div class="acts"><button class="btn" onclick="play()">▶ Watch Now</button><button class="btn g" id="ml" onclick="toggleList(ALL[SH.i][1])"></button></div><div id="ctl"></div><div id="np"></div><h4 id="eh" style="display:none">EPISODES</h4><div class="eps" id="eps"></div><div id="cm"></div></div>';
  sh.classList.remove('pm');sh.scrollTop=0;sh.classList.add('on');document.getElementById('ov').classList.add('on');document.body.style.overflow='hidden';paint();
}

function play(k){if(k){SH.e=k;SH.pg=Math.floor((k-1)/PG)}SH.play=1;paint()}
function eN(){return EPN[ALL[SH.i][1]]||12}
function mlbtn(){var b=document.getElementById('ml');if(b)b.textContent=U&&U.list.indexOf(ALL[SH.i][1])>-1?'✓ In My List':'+ My List'}
function toggleList(n){if(!U){authView('in');toast('Login to use My List');return}var k=U.list.indexOf(n);if(k>-1)U.list.splice(k,1);else U.list.push(n);save();decorate();mlbtn()}

async function paint(){
  var a=ALL[SH.i],n=eN(),ns=SEASONS[a[1]]||3,sh=document.getElementById('sheet'),t=document.getElementById('shtop'),i,o='',rg='',z,pg=Math.min(SH.pg||0,Math.floor((n-1)/PG));
  document.getElementById('eh').style.display=SH.play?'':'none';
  if(!SH.play){document.getElementById('ctl').innerHTML='';document.getElementById('eps').innerHTML='';document.getElementById('cm').innerHTML='';document.getElementById('np').innerHTML='';mlbtn();return}
  
  for(i=1;i<=ns;i++)o+='<option value="'+i+'"'+(i===SH.s?' selected':'')+'>Season '+i+'</option>';
  if(n>PG){for(z=0;z*PG<n;z++)rg+='<option value="'+z+'"'+(z===pg?' selected':'')+'>Ep '+(z*PG+1)+'–'+Math.min(n,(z+1)*PG)+'</option>';rg='<select class="sel" onchange="SH.pg=+this.value;paint()" aria-label="Episode range">'+rg+'</select>'}
  
  document.getElementById('ctl').innerHTML='<select class="sel" onchange="SH.s=+this.value;SH.e=1;SH.pg=0;paint()" aria-label="Season">'+o+'</select><div class="seg">'+LANGS.map(function(x){return '<button class="'+(x[0]===SH.l?'on':'')+'" onclick="SH.l=\''+x[0]+'\';paint()">'+x[1]+'</button>'}).join('')+'</div><div class="seg">'+[0,1].map(function(v){return '<button class="'+(v===SH.v?'on':'')+'" onclick="SH.v='+v+';paint()">Server 0'+(v+1)+'</button>'}).join('')+'</div>'+rg;
  o='';for(i=pg*PG+1;i<=Math.min(n,pg*PG+PG);i++)o+='<button class="'+(SH.play&&i===SH.e?'on':'')+'" onclick="play('+i+')">'+i+'</button>';
  document.getElementById('eps').innerHTML=o;mlbtn();cmt();
  
  if(!SH.play)return;

  var u = vurl(a[1],SH.s,SH.e,SH.l,SH.v) || vurl(a[1],SH.s,SH.e,SH.l,1-SH.v);
  var b;

  if(!u){
    t.className='sh-top pl';
    t.removeAttribute('style');
    t.innerHTML = '<div class="nov"><b>⏳</b><span>Loading stream...</span><small>Please wait (First load may take 30s)</small></div><button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button>';

    var anilistId = a[10] || a.id || null;
    if(anilistId){
      var streamUrl = await getStream(anilistId, SH.e, SH.l === 'dub' ? 'dub' : 'sub');
      if(streamUrl){
        u = streamUrl;
      }
    }
  }

  if(!u){
    b='<div class="nov"><b>▶</b><span>'+esc(a[1])+' · S'+SH.s+' E'+SH.e+'</span><small>'+SH.l.toUpperCase()+' · Server 0'+(SH.v+1)+' · Video not found</small></div>';
  }
  else if(u.includes('.m3u8')){
    b='<video id="hls-video" controls playsinline autoplay onended="if(U&&U.prefs.auto&&SH.e<eN())play(SH.e+1)"></video>';
  }
  else if(/\.(mp4|webm|ogg)(\?|$)/i.test(u)){
    b='<video src="'+esc(u)+'" controls playsinline autoplay onended="if(U&&U.prefs.auto&&SH.e<eN())play(SH.e+1)"></video>';
  }
  else {
    b='<iframe src="'+esc(u)+'" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>';
  }

  t.className='sh-top pl';
  t.removeAttribute('style');
  t.innerHTML=b+'<button class="sh-x" onclick="closeSheet()" aria-label="Close">✕</button>';
  
  if(u && u.includes('.m3u8')){
    setTimeout(function(){
      var video = document.getElementById('hls-video');
      if(video && typeof Hls !== 'undefined'){
        if (Hls.isSupported()) {
          var hls = new Hls();
          hls.loadSource(u);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = u;
        }
      }
    }, 100);
  }

  document.getElementById('np').innerHTML='<div class="np"><span>▶ S'+SH.s+' · Episode '+SH.e+'</span><div><button '+(SH.e<2?'disabled ':'')+'onclick="play('+(SH.e-1)+')">‹ Prev</button><button '+(SH.e>=n?'disabled ':'')+'onclick="play('+(SH.e+1)+')">Next ›</button></div></div>';
  sh.classList.add('pm');
  if(U){U.hist=U.hist.filter(function(h){return !(h.n===a[1]&&h.s===SH.s&&h.e===SH.e)});U.hist.unshift({n:a[1],s:SH.s,e:SH.e});U.hist=U.hist.slice(0,50);save()}
}

function decorate(){document.querySelectorAll('.card').forEach(function(c,i){var a=ALL[i];if(!a)return;var p=c.querySelector('.poster'),b=c.querySelector('.bm');
if(hasVid(a[1])&&!c.querySelector('.wbtn')){p.classList.add('hv');var w=document.createElement('button');w.className='wbtn';w.textContent='▶ Watch';w.onclick=function(e){e.stopPropagation();openSheet(i);play()};p.appendChild(w)}
if(b){b.classList.toggle('on',!!U&&U.list.indexOf(a[1])>-1);b.onclick=function(e){e.stopPropagation();toggleList(a[1])}}})}

document.getElementById('mw').addEventListener('click',function(e){if(e.target.id==='mw')closeM()});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeM()});

/* ---- comments ---- */
function ck(){return 'akC:'+ALL[SH.i][1]+':'+SH.s+':'+SH.e}
function ago(t){var s=(Date.now()-t)/1000;return s<60?'just now':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':Math.floor(s/86400)+'d ago'}
function cmt(){var L=ls(ck())||[],h='<h4>COMMENTS · S'+SH.s+' E'+SH.e+' <span class="cnt">'+L.length+'</span></h4>';
h+=U?'<div class="cbox">'+av(U,36)+'<textarea id="ct" maxlength="500" rows="2" placeholder="Write a comment..."></textarea><button class="btn sm" onclick="postC()">Post</button></div>':'<button class="lnk" onclick="authView(\'in\')">Login to join the discussion</button>';
h+=L.length?L.map(function(c,i){var l=c.l||[];return '<div class="cmt">'+av(USERS[c.e]||{},34)+'<div><b>'+esc(c.n)+'</b><small>'+ago(c.t)+'</small><p>'+esc(c.x)+'</p><button class="lk'+(U&&l.indexOf(U.email)>-1?' on':'')+'" onclick="likeC('+i+')">♥ '+l.length+'</button>'+(U&&c.e===U.email?'<button class="lk" onclick="delC('+i+')">Delete</button>':'')+'</div></div>'}).join(''):'<p class="mu" style="margin-top:10px">No comments yet. Be the first!</p>';
document.getElementById('cm').innerHTML=h}
function postC(){var t=document.getElementById('ct'),x=t.value.trim();if(!x||!U)return;var k=ck(),L=ls(k)||[];L.unshift({e:U.email,n:U.name,x:x,t:Date.now(),l:[]});ls(k,L.slice(0,100));cmt()}
function likeC(i){if(!U){authView('in');return}var k=ck(),L=ls(k)||[],c=L[i];if(!c)return;c.l=c.l||[];var j=c.l.indexOf(U.email);if(j>-1)c.l.splice(j,1);else c.l.push(U.email);ls(k,L);cmt()}
function delC(i){var k=ck(),L=ls(k)||[];L.splice(i,1);ls(k,L);cmt()}

ub();applyTheme();decorate();
