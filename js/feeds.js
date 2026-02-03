/**
 * RSS Feed parser for Payload Reader
 * Fetches and parses NPR feeds via CORS proxy
 */

const PayloadFeeds = {
    // Use Full-Text RSS to convert NPR feeds to full text
    useFullTextFeeds: true,
    // Internal serverless proxy endpoint (works on Vercel deploys)
    apiProxyEndpoint: '/api/proxy?url=',
    // CORS proxies for RSS feeds and article extraction (fallback for local dev)
    corsProxies: [
        { name: 'corsproxy', url: 'https://corsproxy.io/?url=', format: 'raw' },
        { name: 'allorigins-raw', url: 'https://api.allorigins.win/raw?url=', format: 'raw' },
        { name: 'allorigins-json', url: 'https://api.allorigins.win/get?url=', format: 'json' }
    ],

    // NPR RSS feeds
    feeds: [
        { id: 'national', name: 'NPR NATIONAL', url: 'https://feeds.npr.org/1003/rss.xml' },
        { id: 'world', name: 'NPR WORLD', url: 'https://feeds.npr.org/1004/rss.xml' },
        { id: 'business', name: 'NPR BUSINESS', url: 'https://feeds.npr.org/1006/rss.xml' }
    ],

    /**
     * Build a full-text feed URL (FiveFilters Full-Text RSS)
     */
    getFullTextFeedUrl(feedUrl) {
        return `https://ftr.fivefilters.org/makefulltextfeed.php?url=${encodeURIComponent(feedUrl)}`;
    },

    /**
     * Fetch text with timeout
     */
    async fetchTextWithTimeout(url, timeoutMs = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            const text = response.ok ? await response.text() : '';
            return { ok: response.ok, status: response.status, text };
        } catch (error) {
            return { ok: false, status: 0, text: '', error };
        } finally {
            clearTimeout(timeoutId);
        }
    },

    /**
     * Check if text looks like an RSS/Atom feed
     */
    isRssLike(text) {
        if (!text) return false;
        return /<rss\b|<feed\b|<rdf:RDF\b/i.test(text);
    },

    /**
     * Try serverless proxy first (same-origin)
     */
    async tryFetchViaApiProxy(targetUrl, validateFn) {
        if (!this.apiProxyEndpoint) {
            return { success: false };
        }

        const proxyUrl = this.apiProxyEndpoint + encodeURIComponent(targetUrl);
        const res = await this.fetchTextWithTimeout(proxyUrl);

        if (!res.ok) {
            return { success: false, error: `api proxy: status ${res.status || 'network'}` };
        }

        if (res.text && (!validateFn || validateFn(res.text))) {
            return { success: true, text: res.text };
        }

        return { success: false, error: 'api proxy: invalid response' };
    },

    /**
     * Fetch text directly or via proxy fallbacks
     */
    async fetchTextWithFallbacks(targetUrl, validateFn = null) {
        let lastError = null;

        const apiProxyResult = await this.tryFetchViaApiProxy(targetUrl, validateFn);
        if (apiProxyResult.success) {
            return apiProxyResult.text;
        }
        if (apiProxyResult.error) {
            lastError = apiProxyResult.error;
        }

        const direct = await this.fetchTextWithTimeout(targetUrl);
        if (direct.ok && (!validateFn || validateFn(direct.text))) {
            return direct.text;
        }

        if (direct.ok) {
            lastError = 'direct: invalid response';
        } else if (direct.error) {
            lastError = `direct: ${direct.error.message}`;
        } else {
            lastError = `direct: status ${direct.status}`;
        }

        for (const proxy of this.corsProxies) {
            const proxiedUrl = proxy.url + encodeURIComponent(targetUrl);
            const res = await this.fetchTextWithTimeout(proxiedUrl);

            if (!res.ok) {
                lastError = `${proxy.name}: status ${res.status || 'network'}`;
                continue;
            }

            if (proxy.format === 'json') {
                try {
                    const json = JSON.parse(res.text);
                    if (json?.contents) {
                        if (!validateFn || validateFn(json.contents)) {
                            return json.contents;
                        }
                        lastError = `${proxy.name}: invalid response`;
                    }
                } catch (e) {
                    lastError = `${proxy.name}: invalid JSON`;
                    continue;
                }
            } else {
                if (res.text && (!validateFn || validateFn(res.text))) {
                    return res.text;
                }
                lastError = `${proxy.name}: invalid response`;
            }
        }

        throw new Error(`Failed to fetch via proxies (${lastError || 'unknown error'})`);
    },

    /**
     * Fetch a single RSS feed (try direct first, then CORS proxy)
     */
    async fetchFeed(feedUrl) {
        const targetUrl = this.useFullTextFeeds
            ? this.getFullTextFeedUrl(feedUrl)
            : feedUrl;
        const xml = await this.fetchTextWithFallbacks(targetUrl, this.isRssLike);
        return this.parseRSS(xml);
    },

    /**
     * Parse RSS XML into articles
     */
    parseRSS(xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        // Check for parse errors
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            const snippet = (xml || '').slice(0, 160).replace(/\s+/g, ' ').trim();
            throw new Error(`Failed to parse RSS feed: ${snippet || 'empty response'}`);
        }

        const items = doc.querySelectorAll('item');
        const articles = [];

        items.forEach(item => {
            const article = this.parseItem(item);
            if (article) {
                articles.push(article);
            }
        });

        return articles;
    },

    /**
     * Parse a single RSS item
     */
    parseItem(item) {
        const getElementText = (tagName) => {
            const el = item.querySelector(tagName);
            return el?.textContent?.trim() || '';
        };

        const title = getElementText('title');
        const link = getElementText('link');
        const pubDate = getElementText('pubDate');
        const description = getElementText('description');

        // Try to get full content from content:encoded or description
        let content = '';
        const contentEncoded = item.querySelector('content\\:encoded, encoded');
        if (contentEncoded) {
            content = contentEncoded.textContent?.trim() || '';
        } else {
            content = description;
        }

        // Clean HTML from content for plain text display
        const cleanContent = this.cleanHTML(content);

        // Generate unique ID from link
        const id = this.generateId(link || title);

        // Get source from dc:creator or default
        let source = 'NPR';
        const creator = item.querySelector('dc\\:creator, creator');
        if (creator) {
            source = creator.textContent?.trim() || 'NPR';
        }

        // Calculate word count
        const wordCount = this.countWords(cleanContent);

        return {
            id,
            title: this.cleanHTML(title),
            link,
            pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            description: this.cleanHTML(description),
            content: cleanContent,
            fullContent: null, // Will be fetched separately
            source,
            wordCount,
            readStatus: false
        };
    },

    /**
     * Fetch full article content using FiveFilters Full-Text RSS extract API.
     * https://www.fivefilters.org/full-text-rss/ - extract.php returns JSON with article body.
     * Proxied via CORS proxy so the request works from the browser.
     */
    async fetchFullContent(articleUrl) {
        if (!articleUrl) return null;

        try {
            const extractUrl =
                'https://ftr.fivefilters.org/extract.php?url=' +
                encodeURIComponent(articleUrl) +
                '&content=text';
            const raw = await this.fetchTextWithFallbacks(extractUrl);
            let json;
            try {
                json = JSON.parse(raw);
            } catch (e) {
                console.warn('Full content response was not JSON');
                return null;
            }
            const text = json?.content?.trim() || json?.excerpt?.trim() || null;
            return text;
        } catch (e) {
            console.error('Failed to fetch full content:', e);
            return null;
        }
    },

    /**
     * Clean HTML tags and entities from text
     */
    cleanHTML(html) {
        if (!html) return '';

        // Create a temporary element to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Get text content
        let text = temp.textContent || temp.innerText || '';

        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();

        return text;
    },

    /**
     * Generate unique ID from string
     */
    generateId(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `article-${Math.abs(hash)}`;
    },

    /**
     * Count words in text
     */
    countWords(text) {
        if (!text) return 0;
        return text.split(/\s+/).filter(word => word.length > 0).length;
    },

    /**
     * Fetch all feeds and store articles
     */
    async syncAllFeeds() {
        const allArticles = [];
        const errors = [];

        for (const feed of this.feeds) {
            try {
                const articles = await this.fetchFeed(feed.url);
                // Add feed source to each article
                articles.forEach(article => {
                    article.feedId = feed.id;
                    article.feedName = feed.name;
                });
                allArticles.push(...articles);
            } catch (e) {
                console.error(`Failed to fetch ${feed.name}:`, e);
                errors.push({ feed: feed.name, error: e.message });
            }
        }

        // Get existing articles to preserve read status
        const existingArticles = await PayloadDB.getArticles();
        const existingMap = new Map(existingArticles.map(a => [a.id, a]));

        // Merge with existing articles (preserve read status)
        const mergedArticles = allArticles.map(article => {
            const existing = existingMap.get(article.id);
            if (existing) {
                return { ...article, readStatus: existing.readStatus };
            }
            return article;
        });

        // Save all articles
        await PayloadDB.saveArticles(mergedArticles);

        // Update last sync time
        await PayloadDB.updateLastSync();

        // Clean up old articles (older than 7 days)
        const deleted = await PayloadDB.deleteOldArticles(7);

        return {
            total: mergedArticles.length,
            new: mergedArticles.filter(a => !existingMap.has(a.id)).length,
            deleted,
            errors
        };
    },

    /**
     * Get articles with optional filtering
     */
    async getArticles(filter = 'all') {
        switch (filter) {
            case 'unread':
                return PayloadDB.getArticlesByStatus(false);
            case 'read':
                return PayloadDB.getArticlesByStatus(true);
            default:
                return PayloadDB.getArticles();
        }
    },

    /**
     * Mark article as read
     */
    async markAsRead(articleId) {
        return PayloadDB.setArticleReadStatus(articleId, true);
    },

    /**
     * Mark article as unread
     */
    async markAsUnread(articleId) {
        return PayloadDB.setArticleReadStatus(articleId, false);
    },

    /**
     * Toggle article read status
     */
    async toggleReadStatus(articleId) {
        const article = await PayloadDB.getArticle(articleId);
        if (article) {
            return PayloadDB.setArticleReadStatus(articleId, !article.readStatus);
        }
    },

    /**
     * Format relative time for display
     */
    formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 60) {
            return `${minutes}M AGO`;
        } else if (hours < 24) {
            return `${hours}H AGO`;
        } else if (days < 7) {
            return `${days}D AGO`;
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            }).toUpperCase();
        }
    },

    /**
     * Format word count for display
     */
    formatWordCount(count) {
        if (count < 1000) {
            return `${count} WORDS`;
        } else {
            return `${(count / 1000).toFixed(1)}K WORDS`;
        }
    }
};
