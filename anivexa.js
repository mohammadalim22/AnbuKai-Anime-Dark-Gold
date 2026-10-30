const ANIVEXA_API = "https://anivexa-api-wi89.onrender.com";

async function getStream(anilistId, episode, type = "sub") {
  try {
    // প্রথমে কয়েকটা প্রোভাইডার ট্রাই করবে
    const providers = ["reanime", "anikoto", "anizone", "aniwaves"];

    for (const provider of providers) {
      const url = `\( {ANIVEXA_API}/watch/ \){provider}/\( {anilistId}/ \){type}/${episode}`;
      
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      
      // যদি স্ট্রিম URL পায়
      if (data && data.sources && data.sources.length > 0) {
        return data.sources[0].url; // প্রথম সোর্স রিটার্ন করবে
      }
      
      if (data && data.url) {
        return data.url;
      }
    }

    return null; // কিছু না পেলে
  } catch (err) {
    console.error("Anivexa Error:", err);
    return null;
  }
    }
