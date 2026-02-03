/**
 * Main application logic for Payload Reader
 * Coordinates all modules and handles initialization
 */

const PayloadApp = {
    initialized: false,

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) return;

        console.log('PAYLOAD READER INITIALIZING...');

        try {
            // Initialize database first
            await PayloadDB.init();
            console.log('DATABASE INITIALIZED');

            // Load theme and textOnly before UI paint
            const theme = await PayloadDB.getSetting('theme');
            const textOnly = await PayloadDB.getSetting('textOnly');

            // Initialize UI
            PayloadUI.init();
            PayloadUI.applyStoredSettings(theme, textOnly);
            console.log('UI INITIALIZED');

            // Initialize clock
            await PayloadClock.init();
            console.log('CHRONOMETER INITIALIZED');

            // Initialize weather
            await PayloadWeather.init();
            console.log('WEATHER MODULE INITIALIZED');

            // Update signal status
            PayloadUI.updateSignalStatus(navigator.onLine);

            // Load last sync time
            const lastSync = await PayloadDB.getLastSync();
            PayloadUI.updateLastSync(lastSync);

            // Load cached articles
            await PayloadUI.refreshArticleList();

            // Load weather
            await this.loadWeather();

            // Check for updates if online
            if (navigator.onLine) {
                this.checkForUpdates();
            }

            this.initialized = true;
            console.log('PAYLOAD READER READY');

        } catch (error) {
            console.error('INITIALIZATION FAILED:', error);
            PayloadUI.showMessage('INITIALIZATION ERROR: ' + error.message);
        }
    },

    /**
     * Load weather data
     */
    async loadWeather() {
        if (!PayloadWeather.apiKey) {
            PayloadUI.showWeatherError('API KEY NOT CONFIGURED - TAP TO CONFIGURE');
            // Make weather panel clickable to open settings
            const weatherPanel = document.getElementById('weather-panel');
            if (weatherPanel) {
                weatherPanel.style.cursor = 'pointer';
                weatherPanel.addEventListener('click', () => {
                    PayloadUI.showSettings();
                });
            }
            return;
        }

        try {
            const weather = await PayloadWeather.getWeather();
            PayloadUI.updateWeather(weather);

            // Check if stale
            const isStale = await PayloadWeather.isStale(3);
            PayloadUI.showWeatherStale(isStale);

        } catch (error) {
            console.error('Weather load failed:', error);
            PayloadUI.showWeatherError('WEATHER UNAVAILABLE');
        }
    },

    /**
     * Check for updates in the background
     */
    async checkForUpdates() {
        // Don't auto-sync on first load if we have cached content
        const lastSync = await PayloadDB.getLastSync();
        if (!lastSync) return; // Let user manually sync first time

        const hoursSinceSync = (Date.now() - lastSync) / (1000 * 60 * 60);

        // Auto-refresh if more than 4 hours old
        if (hoursSinceSync > 4) {
            console.log('PAYLOAD STALE, AUTO-REFRESHING...');
            try {
                await PayloadFeeds.syncAllFeeds();
                await PayloadUI.refreshArticleList();
                PayloadUI.updateLastSync(Date.now());
                console.log('AUTO-REFRESH COMPLETE');
            } catch (e) {
                console.error('Auto-refresh failed:', e);
            }
        }
    },

    /**
     * Schedule morning sync (called by service worker)
     */
    scheduleMorningSync() {
        // Calculate time until 7 AM
        const now = new Date();
        const tomorrow7AM = new Date(now);
        tomorrow7AM.setDate(tomorrow7AM.getDate() + (now.getHours() >= 7 ? 1 : 0));
        tomorrow7AM.setHours(7, 0, 0, 0);

        const msUntilSync = tomorrow7AM - now;

        // Schedule the sync
        setTimeout(async () => {
            if (navigator.onLine) {
                console.log('MORNING SYNC INITIATED');
                await PayloadFeeds.syncAllFeeds();
                await PayloadWeather.getWeather(true);
            }
            // Schedule next day
            this.scheduleMorningSync();
        }, msUntilSync);

        console.log(`MORNING SYNC SCHEDULED IN ${Math.round(msUntilSync / 3600000)}H`);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    PayloadApp.init();
});

// Handle visibility change (resume from background)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Refresh clock display
        PayloadClock.update();

        // Check if we should refresh data
        if (navigator.onLine) {
            PayloadApp.checkForUpdates();
        }
    }
});
