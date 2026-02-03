/**
 * Multi-timezone clock module for Payload Reader
 * Displays multiple time zones with 12-hour format
 */

const PayloadClock = {
    container: null,
    intervalId: null,

    // Default time zones
    defaultZones: [
        { id: 'local', label: 'SMA', timezone: 'America/Mexico_City' },
        { id: 'chicago', label: 'CHI', timezone: 'America/Chicago' },
        { id: 'newyork', label: 'NYC', timezone: 'America/New_York' },
        { id: 'losangeles', label: 'LAX', timezone: 'America/Los_Angeles' }
    ],

    zones: [],

    /**
     * Initialize the clock
     */
    async init(containerId = 'clocks') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('Clock container not found');
            return;
        }

        // Load saved zones or use defaults
        await this.loadZones();

        // Render initial state
        this.render();

        // Start the clock
        this.start();
    },

    /**
     * Load time zones from settings
     */
    async loadZones() {
        try {
            const savedZones = await PayloadDB.getSetting('timezones');
            this.zones = savedZones || [...this.defaultZones];
        } catch (e) {
            this.zones = [...this.defaultZones];
        }
    },

    /**
     * Save time zones to settings
     */
    async saveZones() {
        try {
            await PayloadDB.saveSetting('timezones', this.zones);
        } catch (e) {
            console.error('Failed to save timezones:', e);
        }
    },

    /**
     * Format time for a specific timezone in 12-hour format
     */
    formatTime(timezone) {
        const now = new Date();
        const options = {
            timeZone: timezone,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };

        try {
            return new Intl.DateTimeFormat('en-US', options).format(now);
        } catch (e) {
            return '--:--:-- --';
        }
    },

    /**
     * Format date for display
     */
    formatDate(timezone) {
        const now = new Date();
        const options = {
            timeZone: timezone,
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        };

        try {
            return new Intl.DateTimeFormat('en-US', options).format(now).toUpperCase();
        } catch (e) {
            return '---';
        }
    },

    /**
     * Render the clock display
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = this.zones.map(zone => `
            <div class="clock-zone" data-id="${zone.id}">
                <span class="clock-label">${zone.label}</span>
                <span class="clock-time" id="time-${zone.id}">${this.formatTime(zone.timezone)}</span>
            </div>
        `).join('');
    },

    /**
     * Update the clock display
     */
    update() {
        this.zones.forEach(zone => {
            const timeEl = document.getElementById(`time-${zone.id}`);
            if (timeEl) {
                timeEl.textContent = this.formatTime(zone.timezone);
            }
        });
    },

    /**
     * Start the clock
     */
    start() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => this.update(), 1000);
    },

    /**
     * Stop the clock
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    },

    /**
     * Add a new timezone
     */
    async addZone(label, timezone) {
        const id = `zone-${Date.now()}`;
        this.zones.push({ id, label, timezone });
        await this.saveZones();
        this.render();
    },

    /**
     * Remove a timezone
     */
    async removeZone(id) {
        this.zones = this.zones.filter(z => z.id !== id);
        await this.saveZones();
        this.render();
    },

    /**
     * Update a timezone
     */
    async updateZone(id, label, timezone) {
        const zone = this.zones.find(z => z.id === id);
        if (zone) {
            zone.label = label;
            zone.timezone = timezone;
            await this.saveZones();
            this.render();
        }
    },

    /**
     * Reset to default zones
     */
    async resetToDefaults() {
        this.zones = [...this.defaultZones];
        await this.saveZones();
        this.render();
    },

    /**
     * Get current date string for status display
     */
    getDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}.${month}.${day}.${hours}${minutes}`;
    }
};
