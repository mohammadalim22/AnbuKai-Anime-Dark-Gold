/* ===== Back button navigation (history stack) =====
   Video -> Watch Now -> Search/Anime page -> Home -> Exit popup
   index.html e SOBAR SHESH e load hobe (animations.js er pore):
   <script src="nav.js?v=6"></script> */
(function(){
var sd=0,cur={p:'home'},exiting=0,closing=0,dlg=null;
var _open=window.openSheet,_play=window.play,_close=window.closeSheet;

/* ---- Exit popup ---- */
var st=document.createElement('style');
st.textContent='#exd{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72)}'
+'#exd .bx{width:min(340px,100%);background:var(--s1);color:var(--text);border:1px solid rgba(233,196,106,.35);border-radius:22px;padding:24px 20px 20px;text-align:center;box-shadow:0 24px 48px -12px rgba(0,0,0,.7)}'
+'#exd h3{font:800 1.1rem Sora,sans-serif;margin-bottom:6px}'
+'#exd p{font-size:.84rem;color:var(--muted);margin-bottom:18px}'
+'#exd .rw2{display:flex;gap:10px}'
+'#exd .btn{flex:1;justify-content:center;margin:0}';
document.head.appendChild(st);

function hideDlg(){if(dlg)dlg.style.display='none'}
function showDlg(){
  if(!dlg){
    dlg=document.createElement('div');dlg.id='exd';
    dlg.innerHTML='<div class="bx"><h3>Exit AnbuKai?</h3><p>Do you really want to exit?</p><div class="rw2"><button class="btn g" id="exn">Cancel</button><button class="btn" id="exy">Exit</button></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#exn').onclick=hideDlg;
    dlg.addEventListener('click',function(e){if(e.target===dlg)hideDlg()});
    dlg.querySelector('#exy').onclick=function(){
      exiting=1;hideDlg();
      history.go(-2); /* guard + home entry paar hoye website er baire */
      setTimeout(function(){try{window.close()}catch(e){}exiting=0},500);
    };
  }
  dlg.style.display='flex';
}

/* ---- history helpers ---- */
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
window.akPush=function(s){if(same(s,cur))return;cur=s;history.pushState(s,'')};

/* guard entry + home entry */
history.replaceState({g:1},'');
history.pushState(cur,'');

/* ---- Sheet (anime detail + video) ---- */
window.openSheet=function(i){
  _open(i);
  if(!sd){sd=1;cur={s:1};history.pushState(cur,'')}
};
window.play=function(k){
  var was=window.SH&&SH.play;
  _play(k);
  if(!was&&window.SH&&SH.play&&sd===1){sd=2;cur={s:2};history.pushState(cur,'')}
};
window.closeSheet=function(){
  if(sd>0){
    if(closing)return;
    closing=1;setTimeout(function(){closing=0},600);
    history.go(-sd);
  }else _close();
};

/* ---- Back button ---- */
window.addEventListener('popstate',function(e){
  var s=e.state||{};closing=0;
  var mw=document.getElementById('mw');
  /* login/profile modal khola thakle shudhu oita bondho hobe */
  if(mw&&mw.classList.contains('on')&&typeof closeM==='function'){
    closeM();history.pushState(cur,'');return;
  }
  /* home er pichone = guard -> Exit popup */
  if(s.g){
    if(exiting)return;
    if(sd){sd=0;_close()}
    cur={p:'home'};history.pushState(cur,'');
    showDlg();return;
  }
  hideDlg();
  if(s.s){
    /* video theke Watch Now (detail) e fire asha */
    if(s.s===1&&sd===2){sd=1;_open(SH.i)}
    cur=s;return;
  }
  var had=sd;
  if(sd){sd=0;_close()}
  cur=s;
  /* sheet bondho howar por page ager mototai ache, tai abar render lagbe na */
  if(!had&&window.akGo)window.akGo(s);
});
})();
