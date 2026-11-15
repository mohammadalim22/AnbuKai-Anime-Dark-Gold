/* ===== VIDEO SETTINGS ===== */
var VIDEOS = {};

/* ---- Naruto Shippuden S1 E1-10 ---- */
(function() {
    var base = 'https://pub-b3b8e974b48a4470bcaf08e042ed655e.r2.dev/Naruto_Shippuden_%5BEnglish%5D_720P_S01_E', s1 = {}, i;

    // ১-১০ পর্ব পর্যন্ত ডিফল্ট ইংলিশ ডাব (English Dub) লিংক
    for (i = 1; i <= 10; i++) {
        s1[i] = { dub: [base + (i < 10 ? '0' + i : i) + '.mp4', ''] };
    }

    // --- Episode 1 এর জন্য আপনার দেওয়া লিংকগুলো ---
    s1[1].hindi = [
        'https://vidmoly.org/embed-wvlq0e4ot4ci.html', // Hindi Server 1 (Embed)
        'https://byselapuix.com/e/t4o7c3973jg1',       // Hindi Server 2 (Embed)
        'https://pixeldrain.com/u/wtTUYAay?embed'      // PixelDrain Embed Link (Server 3)
    ];

    // ডাউনলোড বাটনের জন্য আলাদা লিংক (player.js এই লিংকটি খুঁজে বের করবে)
    s1[1].dl = {
        hindi: 'https://pixeldrain.com/api/file/wtTUYAay?download'
    };

    VIDEOS['Naruto Shippuden'] = { 1: s1 };
    VIDEOS['Naruto: Shippuden'] = VIDEOS['Naruto Shippuden'];
    VIDEOS['Naruto: Shippuuden'] = VIDEOS['Naruto Shippuden'];
})();

/* Season dropdown e shudhu Season 1 dekhabe */
window.addEventListener('load', function() {
    if (typeof SEASONS !== 'undefined') {
        SEASONS['Naruto Shippuden'] = 1;
        SEASONS['Naruto: Shippuden'] = 1;
        SEASONS['Naruto: Shippuuden'] = 1;
    }
});