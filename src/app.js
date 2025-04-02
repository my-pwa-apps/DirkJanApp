const CORS_PROXIES = [
    'https://corsproxy.garfieldapp.workers.dev/cors-proxy?',
    'https://api.allorigins.win/raw?url='
];

async function fetchWithFallback(url) {
    let lastError;
    for (const proxy of CORS_PROXIES) {
        try {
            const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return response;
            }
        } catch (error) {
            lastError = error;
            console.warn(`Failed to fetch using proxy ${proxy}:`, error);
            continue;
        }
    }
    throw lastError || new Error('All proxies failed');
}

async function DisplayComic(date) {
    try {
        const url = `https://dirkjan.nl/cartoon/${date}`;
        const response = await fetchWithFallback(url);
        // ...existing code for handling the response...
    } catch (error) {
        console.error('Error fetching comic:', error);
        document.getElementById('comic').innerHTML = 'Sorry, could not load the comic. Please try again later.';
    }
}