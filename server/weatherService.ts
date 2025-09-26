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
    // Use environment variable for API key
    const weatherApiKey = apiKey || process.env.OPENWEATHER_API_KEY;
    
    if (!weatherApiKey) {
      console.log("No weather API key configured, skipping weather data");
      return null;
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Weather API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OpenWeatherResponse = await response.json();
    
    // Map OpenWeather conditions to simplified conditions
    const weatherCondition = mapWeatherCondition(data.weather[0].main);
    
    return {
      temperature: Math.round(data.main.temp * 10) / 10, // Round to 1 decimal
      condition: weatherCondition,
      location: data.name
    };
    
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

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${weatherApiKey}&units=metric`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Weather API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OpenWeatherResponse = await response.json();
    
    const weatherCondition = mapWeatherCondition(data.weather[0].main);
    
    return {
      temperature: Math.round(data.main.temp * 10) / 10,
      condition: weatherCondition,
      location: data.name
    };
    
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