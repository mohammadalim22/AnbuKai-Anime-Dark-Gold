/* ===== VIDEO SETTINGS =====
   Format:
   VIDEOS['Anime Name'][season][episode][language] = [server links]
   language: sub | dub | hindi | bangla
*/

var VIDEOS = {};

/* ---- Naruto Shippuden S1 E1-10 ---- */
(function () {

  var base = 'https://pub-b3b8e974b48a4470bcaf08e042ed655e.r2.dev/Naruto_Shippuden_%5BEnglish%5D_720P_S01_E';

  var s1 = {};
  var i;

  // ===== English Dub: Episode 01-10 =====
  for (i = 1; i <= 10; i++) {
    s1[i] = {
      dub: [
        base + (i < 10 ? '0' + i : i) + '.mp4',
        ''
      ]
    };
  }

  // ===== Episode 01: Hindi Dub =====
  s1[1].hindi = [
    'https://vidmoly.org/embed-wvlq0e4ot4ci.html',
    'https://byselapuix.com/e/t4o7c3973jg1',
    'https://streamtape.com/e/Ool1JqBLB3C77K/',
    'https://byselapuix.com/d/t4o7c3973jg1/naruto-shippuden-hindi-1080p-s01-e01',
    'https://playmogo.com/e/3405nj69b84u',
    'https://playmogo.com/d/3405nj69b84u'
  ];

  // ===== Episode 02: Hindi Dub =====
  s1[2].hindi = [
    'https://mixdrop.top/e/mkkk4wz0t8zj3k',
    'https://voe.sx/e/s5x1bfpx6eqe',
    'https://luluvid.com/e/z1ojfqu4vo9o'
  ];

  // ===== Register Anime =====
  VIDEOS['Naruto Shippuden'] = {
    1: s1
  };

  VIDEOS['Naruto: Shippuden'] = VIDEOS['Naruto Shippuden'];
  VIDEOS['Naruto: Shippuuden'] = VIDEOS['Naruto Shippuden'];

})();

/* ===== Season Dropdown: Only Season 1 ===== */
window.addEventListener('load', function () {

  SEASONS['Naruto Shippuden'] = 1;
  SEASONS['Naruto: Shippuden'] = 1;
  SEASONS['Naruto: Shippuuden'] = 1;

});