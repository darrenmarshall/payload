/**
 * Serverless proxy to fetch whitelisted URLs (RSS feeds, full-text content)
 * Used to bypass browser CORS limits in production (Vercel).
 */

const ALLOWED_PREFIXES = [
    'https://feeds.npr.org/',
    'https://ftr.fivefilters.org/',
    'https://ftr.fivefilters.net/',
    'https://ftr.bazqux.com/',
    'https://r.jina.ai/'
];

export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    const decodedUrl = Array.isArray(url) ? url[0] : url;
    const targetUrl = decodedUrl.startsWith('http')
        ? decodedUrl
        : decodeURIComponent(decodedUrl);

    const allowed = ALLOWED_PREFIXES.some(prefix => targetUrl.startsWith(prefix));
    if (!allowed) {
        return res.status(400).json({ error: 'URL not allowed' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(targetUrl, { signal: controller.signal });

        if (!response.ok) {
            return res
                .status(response.status)
                .json({ error: `Upstream error: ${response.status}` });
        }

        const text = await response.text();
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
        res.status(200).send(text);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Proxy error' });
    } finally {
        clearTimeout(timeout);
    }
}
