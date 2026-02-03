/**
 * UI module for Payload Reader
 * Handles DOM manipulation and user interactions
 */

const PayloadUI = {
    elements: {},
    currentFilter: 'all',
    currentArticle: null,
    unavailableMarker: '[FULL ARTICLE UNAVAILABLE - VISIT SOURCE FOR COMPLETE TEXT]',

    /**
     * Initialize UI
     */
    init() {
        this.cacheElements();
        this.bindEvents();
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Status bar
            signalIndicator: document.getElementById('signal-indicator'),
            lastSync: document.getElementById('last-sync'),

            // Weather
            weatherCurrent: document.getElementById('weather-current'),
            weatherForecast: document.getElementById('weather-forecast'),
            weatherStale: document.getElementById('weather-stale'),
            weatherLoading: document.getElementById('weather-loading'),

            // Payload stats
            articleCount: document.getElementById('article-count'),
            unreadCount: document.getElementById('unread-count'),

            // Controls
            syncBtn: document.getElementById('sync-btn'),
            filterSelect: document.getElementById('filter-select'),

            // Article list
            articleList: document.getElementById('article-list'),
            articlesPanel: document.getElementById('articles-panel'),
            transmissionsStats: document.getElementById('transmissions-stats'),
            transmissionsControls: document.getElementById('transmissions-controls'),

            // Article detail
            articleDetail: document.getElementById('article-detail'),
            detailTitle: document.getElementById('detail-title'),
            detailSource: document.getElementById('detail-source'),
            detailDate: document.getElementById('detail-date'),
            detailWords: document.getElementById('detail-words'),
            detailContent: document.getElementById('detail-content'),
            backBtn: document.getElementById('back-btn'),
            markReadBtn: document.getElementById('mark-read-btn'),

            // Dashboard
            dashboard: document.getElementById('dashboard'),

            // Settings
            settingsModal: document.getElementById('settings-modal'),
            weatherLocation: document.getElementById('weather-location'),
            weatherApiKey: document.getElementById('weather-api-key'),
            saveSettings: document.getElementById('save-settings'),
            closeSettings: document.getElementById('close-settings'),
            clearCacheBtn: document.getElementById('clear-cache-btn'),
            textOnlyCb: document.getElementById('text-only-cb'),
            darkModeCb: document.getElementById('dark-mode-cb'),
            timezoneList: document.getElementById('timezone-list'),

            // Top bar temp
            topTemp: document.getElementById('top-temp'),

            // Collapsible panels
            clockPanel: document.getElementById('clock-panel'),
            weatherPanelSection: document.getElementById('weather-panel')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Sync button
        this.elements.syncBtn?.addEventListener('click', () => {
            this.onSync();
        });

        // Filter select
        this.elements.filterSelect?.addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.refreshArticleList();
        });

        // Back button
        this.elements.backBtn?.addEventListener('click', () => {
            this.hideArticleDetail();
        });

        // Mark read button
        this.elements.markReadBtn?.addEventListener('click', () => {
            this.onToggleRead();
        });

        // Settings buttons
        this.elements.saveSettings?.addEventListener('click', () => {
            this.saveSettings();
        });

        this.elements.closeSettings?.addEventListener('click', () => {
            this.hideSettings();
        });

        this.elements.clearCacheBtn?.addEventListener('click', () => {
            this.clearCacheAndReload();
        });

        this.elements.textOnlyCb?.addEventListener('change', (e) => {
            this.onTextOnlyChange(e.target.checked);
        });

        this.elements.darkModeCb?.addEventListener('change', (e) => {
            this.onDarkModeChange(e.target.checked);
        });

        // Network status
        window.addEventListener('online', () => this.updateSignalStatus(true));
        window.addEventListener('offline', () => this.updateSignalStatus(false));

        // Collapsible panels
        this.initCollapsiblePanels();
    },

    /**
     * Initialize collapsible panel toggles
     */
    initCollapsiblePanels() {
        document.querySelectorAll('.panel.collapsible .panel-title').forEach(title => {
            title.addEventListener('click', () => {
                const panel = title.closest('.panel');
                panel.classList.toggle('collapsed');

                // Update toggle icon
                const icon = title.querySelector('.toggle-icon');
                if (icon) {
                    icon.textContent = panel.classList.contains('collapsed') ? '+' : '-';
                }
            });
        });
    },

    // ============ STATUS BAR ============

    /**
     * Update signal status indicator
     */
    updateSignalStatus(online) {
        if (this.elements.signalIndicator) {
            if (online) {
                this.elements.signalIndicator.textContent = 'ONLINE';
                this.elements.signalIndicator.classList.remove('offline');
                this.elements.signalIndicator.classList.add('online');
            } else {
                this.elements.signalIndicator.textContent = 'OFFLINE';
                this.elements.signalIndicator.classList.remove('online');
                this.elements.signalIndicator.classList.add('offline');
            }
        }
    },

    /**
     * Update last sync display
     */
    updateLastSync(timestamp) {
        if (this.elements.lastSync) {
            if (timestamp) {
                const date = new Date(timestamp);
                const formatted = PayloadClock.getDateString();
                this.elements.lastSync.textContent = formatted;
            } else {
                this.elements.lastSync.textContent = 'NEVER';
            }
        }
    },

    // ============ WEATHER ============

    /**
     * Update weather display
     */
    updateWeather(weather) {
        if (this.elements.weatherCurrent) {
            if (this.elements.weatherLoading) {
                this.elements.weatherLoading.classList.add('hidden');
            }

            if (weather) {
                this.elements.weatherCurrent.innerHTML = `
                    <div class="weather-main">${PayloadWeather.formatCurrent(weather)}</div>
                    <div class="weather-details">${PayloadWeather.formatDetails(weather)}</div>
                `;

                // Update top bar temperature
                if (this.elements.topTemp) {
                    this.elements.topTemp.textContent = weather.temp;
                }
            } else {
                this.elements.weatherCurrent.innerHTML = '<span class="error">WEATHER DATA UNAVAILABLE</span>';
            }
        }

        if (this.elements.weatherForecast && weather?.forecast) {
            this.elements.weatherForecast.textContent = PayloadWeather.formatForecast(weather);
        }
    },

    /**
     * Show/hide stale weather warning
     */
    showWeatherStale(isStale) {
        if (this.elements.weatherStale) {
            if (isStale) {
                this.elements.weatherStale.classList.remove('hidden');
            } else {
                this.elements.weatherStale.classList.add('hidden');
            }
        }
    },

    /**
     * Show weather error
     */
    showWeatherError(message) {
        if (this.elements.weatherCurrent) {
            if (this.elements.weatherLoading) {
                this.elements.weatherLoading.classList.add('hidden');
            }
            this.elements.weatherCurrent.innerHTML = `<span class="error">${message}</span>`;
        }
    },

    // ============ PAYLOAD STATS ============

    /**
     * Update article counts
     */
    updateCounts(counts) {
        if (this.elements.articleCount) {
            this.elements.articleCount.textContent = counts.total;
        }
        if (this.elements.unreadCount) {
            this.elements.unreadCount.textContent = counts.unread;
        }
        const hasArticles = counts.total > 0;
        if (this.elements.articlesPanel) {
            this.elements.articlesPanel.classList.toggle('has-articles', hasArticles);
        }
        if (this.elements.transmissionsStats) {
            this.elements.transmissionsStats.classList.toggle('hidden', !hasArticles);
        }
        if (this.elements.filterSelect) {
            this.elements.filterSelect.classList.toggle('hidden', !hasArticles);
        }
    },

    // ============ ARTICLE LIST ============

    /**
     * Render article list
     */
    renderArticleList(articles) {
        if (!this.elements.articleList) return;

        if (articles.length === 0) {
            this.elements.articleList.innerHTML = `
                <div class="empty-state">
                    <p>NO TRANSMISSIONS RECEIVED</p>
                    <p>TAP SYNC TO DOWNLOAD PAYLOAD</p>
                </div>
            `;
            return;
        }

        this.elements.articleList.innerHTML = articles.map(article => `
            <div class="article-item ${article.readStatus ? 'read' : 'unread'}" data-id="${article.id}">
                <div class="article-header">
                    <span class="article-source">${article.feedName || article.source}</span>
                    <span class="article-time">${PayloadFeeds.formatRelativeTime(article.pubDate)}</span>
                </div>
                <h3 class="article-title">${article.title}</h3>
                <div class="article-meta">
                    <span class="article-words">${PayloadFeeds.formatWordCount(article.wordCount)}</span>
                    ${article.readStatus ? '<span class="read-indicator">[READ]</span>' : ''}
                </div>
            </div>
        `).join('');

        // Add click handlers
        this.elements.articleList.querySelectorAll('.article-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.showArticleDetail(id);
            });
        });
    },

    /**
     * Refresh article list with current filter
     */
    async refreshArticleList() {
        const articles = await PayloadFeeds.getArticles(this.currentFilter);
        this.renderArticleList(articles);

        const counts = await PayloadDB.getArticleCounts();
        this.updateCounts(counts);
    },

    // ============ ARTICLE DETAIL ============

    /**
     * Show article detail view
     */
    async showArticleDetail(articleId) {
        const article = await PayloadDB.getArticle(articleId);
        if (!article) return;

        this.currentArticle = article;

        // Populate detail view
        if (this.elements.detailTitle) {
            this.elements.detailTitle.textContent = article.title;
        }
        if (this.elements.detailSource) {
            this.elements.detailSource.textContent = article.feedName || article.source;
        }
        if (this.elements.detailDate) {
            this.elements.detailDate.textContent = PayloadFeeds.formatRelativeTime(article.pubDate);
        }
        if (this.elements.detailWords) {
            this.elements.detailWords.textContent = PayloadFeeds.formatWordCount(article.wordCount);
        }

        // Show initial content (excerpt) while loading full content
        if (this.elements.detailContent) {
            let initialContent = article.fullContent || article.content || article.description;
            if (article.fullContent && initialContent?.includes(this.unavailableMarker)) {
                initialContent = (article.content || article.description || '').trim();
                article.fullContent = null;
            }
            this.elements.detailContent.textContent = initialContent;

            // If we don't have full content yet, try to fetch it
            if (!article.fullContent && article.link && navigator.onLine) {
                this.elements.detailContent.textContent = initialContent + '\n\n[LOADING FULL ARTICLE...]';
                this.fetchAndDisplayFullContent(article);
            }
        }

        // Update mark read button
        this.updateMarkReadButton(article.readStatus);

        // Show detail view, hide dashboard
        this.elements.dashboard?.classList.add('hidden');
        this.elements.articleDetail?.classList.remove('hidden');

        // Scroll to top
        window.scrollTo(0, 0);
    },

    /**
     * Fetch and display full article content
     */
    async fetchAndDisplayFullContent(article) {
        try {
            const fullContent = await PayloadFeeds.fetchFullContent(article.link);

            if (fullContent && this.currentArticle?.id === article.id) {
                // Update display
                const cleaned = fullContent.replace(this.unavailableMarker, '').trim();
                this.elements.detailContent.textContent = cleaned;

                // Update word count
                const wordCount = PayloadFeeds.countWords(cleaned);
                if (this.elements.detailWords) {
                    this.elements.detailWords.textContent = PayloadFeeds.formatWordCount(wordCount);
                }

                // Save to database for offline access
                article.fullContent = cleaned;
                article.wordCount = wordCount;
                await PayloadDB.saveArticle(article);
            } else if (this.currentArticle?.id === article.id) {
                // Avoid leaving "loading" state when extraction returns empty
                this.elements.detailContent.textContent =
                    (article.content || article.description) +
                    '\n\n' + this.unavailableMarker;
            }
        } catch (e) {
            console.error('Failed to fetch full content:', e);
            // Keep showing the excerpt
            if (this.currentArticle?.id === article.id) {
                this.elements.detailContent.textContent =
                    (article.content || article.description) +
                    '\n\n' + this.unavailableMarker;
            }
        }
    },

    /**
     * Hide article detail view
     */
    hideArticleDetail() {
        this.currentArticle = null;
        this.elements.articleDetail?.classList.add('hidden');
        this.elements.dashboard?.classList.remove('hidden');

        // Refresh list to show updated read status
        this.refreshArticleList();
    },

    /**
     * Update mark read button text
     */
    updateMarkReadButton(isRead) {
        if (this.elements.markReadBtn) {
            this.elements.markReadBtn.textContent = isRead ? 'MARK UNREAD' : 'MARK READ';
        }
    },

    /**
     * Handle toggle read status
     */
    async onToggleRead() {
        if (!this.currentArticle) return;

        await PayloadFeeds.toggleReadStatus(this.currentArticle.id);
        this.currentArticle.readStatus = !this.currentArticle.readStatus;
        this.updateMarkReadButton(this.currentArticle.readStatus);
    },

    // ============ SYNC ============

    /**
     * Handle sync button click
     */
    async onSync() {
        this.elements.syncBtn.disabled = true;
        this.elements.syncBtn.textContent = 'SYNCING...';

        try {
            // Sync feeds
            const result = await PayloadFeeds.syncAllFeeds();

            // Update UI
            await this.refreshArticleList();
            const lastSync = await PayloadDB.getLastSync();
            this.updateLastSync(lastSync);

            // Show success message (include errors if any feeds failed)
            const errNote = result.errors?.length
                ? ` — ${result.errors.length} FEED(S) FAILED`
                : '';
            this.showMessage(`PAYLOAD RECEIVED: ${result.total} ARTICLES (${result.new} NEW)${errNote}`);

            if (result.errors?.length) {
                const details = result.errors
                    .map(err => `${err.feed}: ${err.error}`)
                    .join(' | ');
                this.showMessage(`SYNC ERRORS: ${details}`);
            }

            // Also refresh weather
            if (PayloadWeather.apiKey) {
                try {
                    const weather = await PayloadWeather.getWeather(true);
                    this.updateWeather(weather);
                    this.showWeatherStale(false);
                } catch (e) {
                    console.error('Weather sync failed:', e);
                }
            }
        } catch (e) {
            console.error('Sync failed:', e);
            this.showMessage('SYNC FAILED: ' + e.message);
        } finally {
            this.elements.syncBtn.disabled = false;
            this.elements.syncBtn.textContent = 'SYNC PAYLOAD';
        }
    },

    // ============ SETTINGS ============

    /**
     * Show settings modal
     */
    showSettings() {
        // Populate current values
        if (this.elements.weatherLocation) {
            this.elements.weatherLocation.value = PayloadWeather.location;
        }
        if (this.elements.weatherApiKey) {
            this.elements.weatherApiKey.value = PayloadWeather.apiKey || '';
        }
        if (this.elements.darkModeCb) {
            this.elements.darkModeCb.checked = document.documentElement.getAttribute('data-theme') === 'dark';
        }

        // Render timezone settings
        this.renderTimezoneSettings();

        this.elements.settingsModal?.classList.remove('hidden');
    },

    /**
     * Hide settings modal
     */
    hideSettings() {
        this.elements.settingsModal?.classList.add('hidden');
    },

    /**
     * Text-only toggle changed (header)
     */
    async onTextOnlyChange(checked) {
        await PayloadDB.saveSetting('textOnly', !!checked);
        PayloadFeeds.textOnly = !!checked;
    },

    /**
     * Dark mode toggle changed (settings)
     */
    async onDarkModeChange(checked) {
        const theme = checked ? 'dark' : 'light';
        await PayloadDB.saveSetting('theme', theme);
        document.documentElement.setAttribute('data-theme', checked ? 'dark' : '');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = checked ? '#0d0d0d' : '#ffffff';
    },

    /**
     * Apply theme and textOnly from storage (call at init)
     */
    applyStoredSettings(theme, textOnly) {
        const isDark = theme === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = isDark ? '#0d0d0d' : '#ffffff';
        PayloadFeeds.textOnly = !!textOnly;
        if (this.elements.textOnlyCb) this.elements.textOnlyCb.checked = !!textOnly;
        if (this.elements.darkModeCb) this.elements.darkModeCb.checked = isDark;
    },

    /**
     * Clear service worker cache and reload (mobile-friendly "hard refresh")
     */
    async clearCacheAndReload() {
        const btn = this.elements.clearCacheBtn;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'CLEARING...';
        }
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                    await reg.unregister();
                }
            }
            if ('caches' in window) {
                const names = await caches.keys();
                await Promise.all(names.map((name) => caches.delete(name)));
            }
        } catch (e) {
            console.warn('Clear cache:', e);
        }
        window.location.reload();
    },

    /**
     * Render timezone settings
     */
    renderTimezoneSettings() {
        if (!this.elements.timezoneList) return;

        this.elements.timezoneList.innerHTML = PayloadClock.zones.map((zone, index) => `
            <div class="timezone-item" data-index="${index}">
                <input type="text" class="tz-label" value="${zone.label}" placeholder="Label">
                <input type="text" class="tz-zone" value="${zone.timezone}" placeholder="Timezone">
            </div>
        `).join('');
    },

    /**
     * Save settings
     */
    async saveSettings() {
        // Save weather settings
        const location = this.elements.weatherLocation?.value;
        const apiKey = this.elements.weatherApiKey?.value;

        if (location) {
            await PayloadWeather.setLocation(location);
        }
        if (apiKey) {
            await PayloadWeather.setApiKey(apiKey);
        }

        // Save timezone settings
        const timezoneItems = this.elements.timezoneList?.querySelectorAll('.timezone-item');
        if (timezoneItems) {
            const newZones = [];
            timezoneItems.forEach((item, index) => {
                const label = item.querySelector('.tz-label')?.value;
                const timezone = item.querySelector('.tz-zone')?.value;
                if (label && timezone) {
                    newZones.push({
                        id: PayloadClock.zones[index]?.id || `zone-${Date.now()}-${index}`,
                        label,
                        timezone
                    });
                }
            });
            PayloadClock.zones = newZones;
            await PayloadClock.saveZones();
            PayloadClock.render();
        }

        this.hideSettings();
        this.showMessage('SETTINGS SAVED');

        // Refresh weather with new settings
        if (apiKey && navigator.onLine) {
            try {
                const weather = await PayloadWeather.getWeather(true);
                this.updateWeather(weather);
            } catch (e) {
                this.showWeatherError('WEATHER API ERROR');
            }
        }
    },

    // ============ MESSAGES ============

    /**
     * Show a temporary message
     */
    showMessage(text, duration = 3000) {
        // Remove existing message
        const existing = document.querySelector('.message-toast');
        if (existing) existing.remove();

        // Create message element
        const message = document.createElement('div');
        message.className = 'message-toast';
        message.textContent = text;
        document.body.appendChild(message);

        // Remove after duration
        setTimeout(() => {
            message.classList.add('fade-out');
            setTimeout(() => message.remove(), 300);
        }, duration);
    }
};
