/* ===== VIDEO SETTINGS =====
   Format: VIDEOS['Anime Name'][season][episode][language] = [server1 link, server2 link]
   language: sub | dub | hindi | bangla
   .mp4/.webm hole direct player, onno (embed) link hole iframe e khulbe.
   Video thakle oi anime card e shobuj "Watch" button ashe.
   Anime Name hubohu AniList er English nam er moto hote hobe (card e jeta dekhay).
   Example:
   VIDEOS['Black Clover']={1:{1:{sub:['videos/bc-s1e1-sub.mp4','https://embed.link/abc'],dub:['videos/bc-s1e1-dub.mp4','']}}}; */
var VIDEOS={};

/* ---- Naruto Shippuden S1 E1-10 ---- */
(function(){
  var base='https://pub-b3b8e974b48a4470bcaf08e042ed655e.r2.dev/Naruto_Shippuden_%5BEnglish%5D_720P_S01_E',s1={},i;
  
  // ১-১০ পর্ব পর্যন্ত ডিফল্ট ইংলিশ ডাব (English Dub) লিংক
  for(i=1;i<=10;i++){
      s1[i]={dub:[base+(i<10?'0'+i:i)+'.mp4','']};
  }
  
  // --- Episode 1 এর জন্য Hindi লিংক ---
  s1[1].hindi = [
      'https://vidmoly.org/embed-wvlq0e4ot4ci.html', // Server 1 (Embed)
      'https://byselapuix.com/e/t4o7c3973jg1',       // Server 2 (Embed)
      'https://streamtape.com/e/Ool1JqBLB3C77K/'     // Server 3 (Streamtape Embed)
  ];

  // --- Episode 2 এর জন্য Hindi লিংক ---
  s1[2].hindi = [
      'https://pixeldrain.com/api/file/hS1sAnbV?download' // Server 1 (Pixeldrain Direct with Download)
  ];

  VIDEOS['Naruto Shippuden']={1:s1};
  VIDEOS['Naruto: Shippuden']=VIDEOS['Naruto Shippuden'];
  VIDEOS['Naruto: Shippuuden']=VIDEOS['Naruto Shippuden'];
})();

/* Season dropdown e shudhu Season 1 dekhabe (auth.js er pore set hoy tai load e) */
window.addEventListener('load',function(){
  SEASONS['Naruto Shippuden']=1;
  SEASONS['Naruto: Shippuden']=1;
  SEASONS['Naruto: Shippuuden']=1;
});