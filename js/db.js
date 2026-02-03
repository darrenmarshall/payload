/**
 * IndexedDB wrapper for Payload Reader
 * Handles articles, weather, and settings storage
 */

const PayloadDB = {
    db: null,
    DB_NAME: 'PayloadReader',
    DB_VERSION: 1,

    /**
     * Initialize the database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Articles store
                if (!db.objectStoreNames.contains('articles')) {
                    const articlesStore = db.createObjectStore('articles', { keyPath: 'id' });
                    articlesStore.createIndex('pubDate', 'pubDate', { unique: false });
                    articlesStore.createIndex('readStatus', 'readStatus', { unique: false });
                    articlesStore.createIndex('source', 'source', { unique: false });
                }

                // Weather store
                if (!db.objectStoreNames.contains('weather')) {
                    db.createObjectStore('weather', { keyPath: 'id' });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Metadata store
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    },

    // ============ ARTICLES ============

    /**
     * Save an article to the database
     */
    async saveArticle(article) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');
            const request = store.put(article);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Save multiple articles
     */
    async saveArticles(articles) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');

            articles.forEach(article => store.put(article));

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /**
     * Get all articles
     */
    async getArticles() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('articles', 'readonly');
            const store = tx.objectStore('articles');
            const request = store.getAll();
            request.onsuccess = () => {
                // Sort by date descending
                const articles = request.result.sort((a, b) =>
                    new Date(b.pubDate) - new Date(a.pubDate)
                );
                resolve(articles);
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a single article by ID
     */
    async getArticle(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('articles', 'readonly');
            const store = tx.objectStore('articles');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get articles by read status
     */
    async getArticlesByStatus(readStatus) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('articles', 'readonly');
            const store = tx.objectStore('articles');
            const index = store.index('readStatus');
            const request = index.getAll(readStatus);
            request.onsuccess = () => {
                const articles = request.result.sort((a, b) =>
                    new Date(b.pubDate) - new Date(a.pubDate)
                );
                resolve(articles);
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Mark an article as read/unread
     */
    async setArticleReadStatus(id, readStatus) {
        const article = await this.getArticle(id);
        if (article) {
            article.readStatus = readStatus;
            return this.saveArticle(article);
        }
    },

    /**
     * Get article counts
     */
    async getArticleCounts() {
        const articles = await this.getArticles();
        return {
            total: articles.length,
            unread: articles.filter(a => !a.readStatus).length,
            read: articles.filter(a => a.readStatus).length
        };
    },

    /**
     * Delete old articles (older than specified days)
     */
    async deleteOldArticles(days = 7) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const articles = await this.getArticles();
        const toDelete = articles.filter(a => new Date(a.pubDate) < cutoff);

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('articles', 'readwrite');
            const store = tx.objectStore('articles');

            toDelete.forEach(article => store.delete(article.id));

            tx.oncomplete = () => resolve(toDelete.length);
            tx.onerror = () => reject(tx.error);
        });
    },

    // ============ WEATHER ============

    /**
     * Save weather data
     */
    async saveWeather(weather) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('weather', 'readwrite');
            const store = tx.objectStore('weather');
            const data = {
                id: 'current',
                ...weather,
                timestamp: Date.now()
            };
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get weather data
     */
    async getWeather() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('weather', 'readonly');
            const store = tx.objectStore('weather');
            const request = store.get('current');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Check if weather data is stale (older than specified hours)
     */
    async isWeatherStale(hours = 1) {
        const weather = await this.getWeather();
        if (!weather) return true;

        const age = Date.now() - weather.timestamp;
        return age > hours * 60 * 60 * 1000;
    },

    // ============ SETTINGS ============

    /**
     * Save a setting
     */
    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            const request = store.put({ key, value });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a setting
     */
    async getSetting(key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get all settings
     */
    async getAllSettings() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const request = store.getAll();
            request.onsuccess = () => {
                const settings = {};
                request.result.forEach(item => {
                    settings[item.key] = item.value;
                });
                resolve(settings);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // ============ METADATA ============

    /**
     * Save metadata (last sync, etc.)
     */
    async saveMetadata(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('metadata', 'readwrite');
            const store = tx.objectStore('metadata');
            const request = store.put({ key, value, timestamp: Date.now() });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get metadata
     */
    async getMetadata(key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('metadata', 'readonly');
            const store = tx.objectStore('metadata');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Update last sync time
     */
    async updateLastSync() {
        return this.saveMetadata('lastSync', Date.now());
    },

    /**
     * Get last sync time
     */
    async getLastSync() {
        const meta = await this.getMetadata('lastSync');
        return meta?.value;
    }
};
