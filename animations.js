/* ANIMATIONS (optional): remove this <script> from index.html to turn off JS animations */
(function(){
  /* hero auto-slide every 6 seconds */
  autoHero=function(){clearInterval(ht);ht=setInterval(function(){if(!document.hidden)showHero(hi+1)},6000)};
  autoHero();
  /* sections fade in while scrolling */
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});
    document.querySelectorAll('section').forEach(function(s){s.classList.add('rv');io.observe(s)});
  }
})();
