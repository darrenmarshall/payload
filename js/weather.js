/**
 * Weather module for Payload Reader
 * OpenWeatherMap API integration with caching
 */

const PayloadWeather = {
    apiKey: null,
    location: 'San Miguel de Allende,MX',
    units: 'metric', // 'metric' for Celsius, 'imperial' for Fahrenheit

    // Weather condition icons (text-based)
    icons: {
        '01d': '[SUN]',      // clear sky day
        '01n': '[MOON]',     // clear sky night
        '02d': '[SUN/CLD]',  // few clouds day
        '02n': '[MOON/CLD]', // few clouds night
        '03d': '[CLOUD]',    // scattered clouds
        '03n': '[CLOUD]',
        '04d': '[CLOUDS]',   // broken clouds
        '04n': '[CLOUDS]',
        '09d': '[RAIN]',     // shower rain
        '09n': '[RAIN]',
        '10d': '[SUN/RAIN]', // rain day
        '10n': '[MOON/RAIN]',// rain night
        '11d': '[STORM]',    // thunderstorm
        '11n': '[STORM]',
        '13d': '[SNOW]',     // snow
        '13n': '[SNOW]',
        '50d': '[FOG]',      // mist
        '50n': '[FOG]'
    },

    /**
     * Initialize weather module
     */
    async init() {
        // Load saved settings
        try {
            const savedApiKey = await PayloadDB.getSetting('weatherApiKey');
            const savedLocation = await PayloadDB.getSetting('weatherLocation');
            const savedUnits = await PayloadDB.getSetting('weatherUnits');

            if (savedApiKey) this.apiKey = savedApiKey;
            if (savedLocation) this.location = savedLocation;
            if (savedUnits) this.units = savedUnits;
        } catch (e) {
            console.error('Failed to load weather settings:', e);
        }
    },

    /**
     * Save API key
     */
    async setApiKey(apiKey) {
        this.apiKey = apiKey;
        await PayloadDB.saveSetting('weatherApiKey', apiKey);
    },

    /**
     * Save location
     */
    async setLocation(location) {
        this.location = location;
        await PayloadDB.saveSetting('weatherLocation', location);
    },

    /**
     * Fetch current weather from API
     */
    async fetchWeather() {
        if (!this.apiKey) {
            throw new Error('Weather API key not configured');
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(this.location)}&units=${this.units}&appid=${this.apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseCurrentWeather(data);
    },

    /**
     * Fetch weather forecast from API
     */
    async fetchForecast() {
        if (!this.apiKey) {
            throw new Error('Weather API key not configured');
        }

        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(this.location)}&units=${this.units}&cnt=8&appid=${this.apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseForecast(data);
    },

    /**
     * Parse current weather response
     */
    parseCurrentWeather(data) {
        const icon = data.weather[0]?.icon || '01d';
        const tempUnit = this.units === 'metric' ? 'C' : 'F';
        const speedUnit = this.units === 'metric' ? 'KM/H' : 'MPH';
        const windSpeed = this.units === 'metric'
            ? Math.round(data.wind.speed * 3.6) // m/s to km/h
            : Math.round(data.wind.speed); // mph

        return {
            temp: Math.round(data.main.temp),
            tempUnit,
            feelsLike: Math.round(data.main.feels_like),
            condition: data.weather[0]?.main?.toUpperCase() || 'UNKNOWN',
            description: data.weather[0]?.description?.toUpperCase() || '',
            icon: this.icons[icon] || '[???]',
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            windSpeed,
            speedUnit,
            windDir: this.getWindDirection(data.wind.deg),
            location: data.name
        };
    },

    /**
     * Parse forecast response
     */
    parseForecast(data) {
        const temps = data.list.map(item => item.main.temp);
        const rainChances = data.list.map(item => item.pop || 0);

        return {
            high: Math.round(Math.max(...temps)),
            low: Math.round(Math.min(...temps)),
            rainChance: Math.round(Math.max(...rainChances) * 100),
            tempUnit: this.units === 'metric' ? 'C' : 'F'
        };
    },

    /**
     * Convert wind degrees to compass direction
     */
    getWindDirection(deg) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(deg / 45) % 8;
        return directions[index];
    },

    /**
     * Get weather data (from cache or API)
     */
    async getWeather(forceRefresh = false) {
        // Check cache first
        if (!forceRefresh) {
            const isStale = await PayloadDB.isWeatherStale(1); // 1 hour
            if (!isStale) {
                const cached = await PayloadDB.getWeather();
                if (cached) {
                    return cached;
                }
            }
        }

        // Fetch fresh data if online
        if (navigator.onLine && this.apiKey) {
            try {
                const [current, forecast] = await Promise.all([
                    this.fetchWeather(),
                    this.fetchForecast()
                ]);

                const weather = { ...current, forecast };
                await PayloadDB.saveWeather(weather);
                return weather;
            } catch (e) {
                console.error('Failed to fetch weather:', e);
                // Fall back to cached data
                const cached = await PayloadDB.getWeather();
                if (cached) return cached;
                throw e;
            }
        }

        // Return cached data if offline
        const cached = await PayloadDB.getWeather();
        if (cached) return cached;

        throw new Error('No weather data available');
    },

    /**
     * Check if weather data is stale (for UI warning)
     */
    async isStale(hours = 3) {
        return PayloadDB.isWeatherStale(hours);
    },

    /**
     * Format weather for display
     */
    formatCurrent(weather) {
        if (!weather) return 'NO DATA';
        return `${weather.temp}°${weather.tempUnit} | ${weather.condition} ${weather.icon} | WIND: ${weather.windSpeed} ${weather.speedUnit} ${weather.windDir}`;
    },

    /**
     * Format weather details for display
     */
    formatDetails(weather) {
        if (!weather) return '';
        return `HUMIDITY: ${weather.humidity}% | PRESSURE: ${weather.pressure} MB | FEELS LIKE: ${weather.feelsLike}°${weather.tempUnit}`;
    },

    /**
     * Format forecast for display
     */
    formatForecast(weather) {
        if (!weather?.forecast) return '';
        const f = weather.forecast;
        return `24H FORECAST: HIGH ${f.high}°${f.tempUnit} | LOW ${f.low}°${f.tempUnit} | ${f.rainChance}% RAIN`;
    }
};
