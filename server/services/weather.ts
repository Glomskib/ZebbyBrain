import { FF } from '../config/flags';

export interface WeatherData {
  tempC: number;
  text: string;
  observedAt: Date;
  lat: number;
  lon: number;
  source: string;
}

/**
 * Fetch current weather from Open-Meteo (no API key required)
 * @param lat Latitude
 * @param lon Longitude  
 * @returns Weather data in Celsius
 */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  if (!FF.WEATHER) {
    return null;
  }

  try {
    // Open-Meteo API - free, no key required
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ZebbysWorld/1.0'
      },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      console.error('Weather API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    // WMO Weather codes to text mapping
    const weatherCodeToText = (code: number): string => {
      const codes: { [key: number]: string } = {
        0: 'Clear sky',
        1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Foggy', 48: 'Depositing rime fog',
        51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
        61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
        71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
        85: 'Slight snow showers', 86: 'Heavy snow showers',
        95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
      };
      return codes[code] || 'Unknown';
    };

    const tempC = Math.round(data.current.temperature_2m * 2) / 2; // Round to nearest 0.5°C
    const weatherCode = data.current.weather_code;
    const text = weatherCodeToText(weatherCode);
    
    return {
      tempC,
      text,
      observedAt: new Date(data.current.time),
      lat,
      lon,
      source: 'open-meteo'
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    return null;
  }
}

/**
 * Convert Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9/5 + 32) * 10) / 10;
}

/**
 * Format temperature with unit
 */
export function formatTemp(tempC: number, unit: 'C' | 'F' = 'F'): string {
  if (unit === 'F') {
    return `${celsiusToFahrenheit(tempC)}°F`;
  }
  return `${tempC}°C`;
}
