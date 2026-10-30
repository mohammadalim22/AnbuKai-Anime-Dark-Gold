var intro=document.getElementById('intro');
try{if(localStorage.getItem('akSkip')==='1'||sessionStorage.getItem('akSeen')==='1')intro.style.display='none'}catch(e){}
function closeIntro(){intro.classList.add('out');try{sessionStorage.setItem('akSeen','1')}catch(e){}}
document.getElementById('enter').onclick=closeIntro;
document.getElementById('skip').onclick=function(){try{localStorage.setItem('akSkip','1')}catch(e){}closeIntro()};
