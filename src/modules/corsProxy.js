/**
 * CORS Proxy Module
 * Handles intelligent CORS proxy fallback for fetching comics
 */

// Define CORS proxies with priority order
const CORS_PROXIES = [
  'https://corsproxy.garfieldapp.workers.dev/cors-proxy?',
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url='
];

// Track which proxy is currently working best
let workingProxyIndex = 0;
let proxyFailureCount = [0, 0, 0];

/**
 * Fetches a URL with intelligent CORS proxy fallback
 * @param {string} url - The URL to fetch
 * @returns {Promise<Response>} The fetch response
 */
export async function fetchWithFallback(url) {
  let lastError;
  const maxRetries = CORS_PROXIES.length;
  
  // Start with the last known working proxy for better performance
  const startIndex = workingProxyIndex;
  
  for (let i = 0; i < maxRetries; i++) {
    const proxyIndex = (startIndex + i) % CORS_PROXIES.length;
    const proxy = CORS_PROXIES[proxyIndex];
    
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { 
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (response.ok) {
        // Success! Update working proxy and reset failure count
        workingProxyIndex = proxyIndex;
        proxyFailureCount[proxyIndex] = 0;
        return response;
      }
      
      // Non-OK response, count as failure
      proxyFailureCount[proxyIndex]++;
      
    } catch (error) {
      lastError = error;
      proxyFailureCount[proxyIndex]++;
      
      // If this proxy has failed multiple times, deprioritize it
      if (proxyFailureCount[proxyIndex] >= 3) {
        continue;
      }
    }
  }
  
  // If all proxies failed, try direct access with no-cors as last resort
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    return response;
  } catch (error) {
    lastError = error;
  }
  
  // Reset failure counts if everything failed (network might be back)
  proxyFailureCount = [0, 0, 0];
  
  throw lastError || new Error('All fetch attempts failed');
}

/**
 * Gets the current CORS proxies list
 * @returns {Array<string>} Array of proxy URLs
 */
export function getCorsProxies() {
  return [...CORS_PROXIES];
}

/**
 * Gets the current working proxy index
 * @returns {number} Index of the currently working proxy
 */
export function getWorkingProxyIndex() {
  return workingProxyIndex;
}
