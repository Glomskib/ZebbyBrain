import { fetchSafe } from "./lib/fetchSafe";

interface WeatherData {
  temperature: number; // Celsius
  condition: string; // sunny, cloudy, rainy, etc.
  location: string;
}

interface OpenWeatherResponse {
  main: {
    temp: number;
  };
  weather: {
    main: string;
    description: string;
  }[];
  name: string;
}

const CACHE = new Map<string, { at: number; data: WeatherData }>();
const DAY_MS = 86_400_000;

/**
 * Get current weather data for a location
 * Uses OpenWeatherMap API (free tier)
 */
export async function getCurrentWeather(
  lat: number, 
  lon: number, 
  apiKey?: string
): Promise<WeatherData | null> {
  try {
    const weatherApiKey = apiKey || process.env.OPENWEATHER_API_KEY;
    
    if (!weatherApiKey) {
      console.log("No weather API key configured, skipping weather data");
      return null;
    }

    const cacheKey = `${lat},${lon}:${new Date().toDateString()}`;
    const cached = CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.at) < DAY_MS) {
      return cached.data;
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric`;
    
    const response = await fetchSafe(url, {}, 3, 4000);
    
    if (!response.ok) {
      console.error(`Weather API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OpenWeatherResponse = await response.json();
    
    const weatherCondition = mapWeatherCondition(data.weather[0].main);
    
    const weatherData: WeatherData = {
      temperature: Math.round(data.main.temp * 10) / 10,
      condition: weatherCondition,
      location: data.name
    };
    
    CACHE.set(cacheKey, { at: Date.now(), data: weatherData });
    return weatherData;
    
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
    return null;
  }
}

/**
 * Get weather by city name (fallback if geolocation not available)
 */
export async function getWeatherByCity(
  city: string, 
  apiKey?: string
): Promise<WeatherData | null> {
  try {
    const weatherApiKey = apiKey || process.env.OPENWEATHER_API_KEY;
    
    if (!weatherApiKey) {
      console.log("No weather API key configured, skipping weather data");
      return null;
    }

    const cacheKey = `${city}:${new Date().toDateString()}`;
    const cached = CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.at) < DAY_MS) {
      return cached.data;
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${weatherApiKey}&units=metric`;
    
    const response = await fetchSafe(url, {}, 3, 4000);
    
    if (!response.ok) {
      console.error(`Weather API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OpenWeatherResponse = await response.json();
    
    const weatherCondition = mapWeatherCondition(data.weather[0].main);
    
    const weatherData: WeatherData = {
      temperature: Math.round(data.main.temp * 10) / 10,
      condition: weatherCondition,
      location: data.name
    };
    
    CACHE.set(cacheKey, { at: Date.now(), data: weatherData });
    return weatherData;
    
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
    return null;
  }
}

/**
 * Map OpenWeather main conditions to simplified categories
 */
function mapWeatherCondition(openWeatherMain: string): string {
  const conditionMap: Record<string, string> = {
    'Clear': 'sunny',
    'Clouds': 'cloudy', 
    'Rain': 'rainy',
    'Drizzle': 'rainy',
    'Thunderstorm': 'stormy',
    'Snow': 'snowy',
    'Mist': 'foggy',
    'Smoke': 'foggy',
    'Haze': 'foggy',
    'Dust': 'hazy',
    'Fog': 'foggy',
    'Sand': 'hazy',
    'Ash': 'hazy',
    'Squall': 'windy',
    'Tornado': 'stormy'
  };
  
  return conditionMap[openWeatherMain] || 'unknown';
}