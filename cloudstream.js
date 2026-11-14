// CORS Proxy (ব্রাউজারে এরর এড়ানোর জন্য)
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// CloudStream এর জনপ্রিয় রেপোগুলোর লিংক
const REPOS = [
    'https://raw.githubusercontent.com/recloudstream/extensions/master/repo.json',
    'https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/builds/repo.json'
];

let availableProviders = [];

// CloudStream রেপো থেকে প্রোভাইডার লিস্ট আনা
async function loadCloudstreamProviders() {
    console.log("CloudStream Providers লোড হচ্ছে...");
    
    for (let repoUrl of REPOS) {
        try {
            // repo.json ফেচ করা
            const response = await fetch(CORS_PROXY + encodeURIComponent(repoUrl));
            const repoData = await response.json();
            
            // plugins.json এর লিংক বের করা
            if (repoData.pluginLists) {
                for (let pluginUrl of repoData.pluginLists) {
                    const pluginRes = await fetch(CORS_PROXY + encodeURIComponent(pluginUrl));
                    const plugins = await pluginRes.json();
                    
                    // প্রোভাইডার লিস্টে যোগ করা
                    plugins.forEach(plugin => {
                        availableProviders.push({
                            name: plugin.name,
                            internalName: plugin.internalName,
                            url: plugin.url,
                            iconUrl: plugin.iconUrl,
                            description: plugin.description
                        });
                    });
                }
            }
        } catch (error) {
            console.error("রেপো লোড করতে সমস্যা:", repoUrl, error);
        }
    }
    
    console.log("Total Providers Found:", availableProviders.length);
    return availableProviders;
}

// ভিডিও লিংক বের করার ফাংশন (Consumet API ব্যবহার করে, কারণ .cs3 সরাসরি চলে না)
async function getVideoLinkFromProvider(animeTitle, episodeNumber) {
    // GogoAnime এর জন্য Consumet API
    const searchQuery = `${animeTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-episode-${episodeNumber}`;
    const apiUrl = `https://api.consumet.org/anime/gogoanime/${searchQuery}`;

    try {
        const res = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
        const data = await res.json();
        
        if (data && data.sources && data.sources.length > 0) {
            return data.sources[0].url; // .m3u8 ভিডিও লিংক রিটার্ন করবে
        } else {
            throw new Error("এই এপিসোডের ভিডিও পাওয়া যায়নি");
        }
    } catch (error) {
        console.error("ভিডিও লিংক আনতে সমস্যা:", error);
        return null;
    }
}