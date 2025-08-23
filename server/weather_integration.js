// Weather API Integration for Busan Tourism System
// Backend service for weather data processing and smart recommendations

class WeatherTourismService {
    constructor(apiKey) {
      this.apiKey = apiKey; // OpenWeatherMap API key
      this.busanCoords = { lat: 35.1796, lng: 129.0756 };
      this.weatherCache = new Map(); // Cache weather data for 10 minutes
      this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
    }
  
    // Fetch current weather data from OpenWeatherMap API
    async fetchWeatherData() {
      const cacheKey = 'busan_weather';
      const cached = this.weatherCache.get(cacheKey);
      
      // Return cached data if still valid
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.data;
      }
  
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${this.busanCoords.lat}&lon=${this.busanCoords.lng}&appid=${this.apiKey}&units=metric`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Process and enhance weather data
        const processedWeather = {
          temperature: Math.round(data.main.temp),
          feelsLike: Math.round(data.main.feels_like),
          condition: data.weather[0].main.toLowerCase(),
          description: data.weather[0].description,
          humidity: data.main.humidity,
          windSpeed: data.wind?.speed || 0,
          windDirection: data.wind?.deg || 0,
          visibility: (data.visibility || 10000) / 1000, // Convert to km
          cloudiness: data.clouds?.all || 0,
          pressure: data.main.pressure,
          uvIndex: data.uvi || null,
          icon: data.weather[0].icon,
          sunrise: new Date(data.sys.sunrise * 1000),
          sunset: new Date(data.sys.sunset * 1000),
          timestamp: Date.now()
        };
  
        // Cache the processed data
        this.weatherCache.set(cacheKey, {
          data: processedWeather,
          timestamp: Date.now()
        });
  
        return processedWeather;
      } catch (error) {
        console.error('Error fetching weather data:', error);
        return this.getFallbackWeather();
      }
    }
  
    // Fallback weather data for demo/offline use
    getFallbackWeather() {
      return {
        temperature: 22,
        feelsLike: 24,
        condition: 'clear',
        description: 'clear sky',
        humidity: 65,
        windSpeed: 3.2,
        windDirection: 180,
        visibility: 10,
        cloudiness: 20,
        pressure: 1013,
        icon: '01d',
        sunrise: new Date(),
        sunset: new Date(),
        timestamp: Date.now()
      };
    }
  
    // Generate smart weather-based tourism recommendations
    generateWeatherRecommendation(attraction, weather) {
      const analysis = this.analyzeWeatherImpact(attraction, weather);
      
      return {
        attractionName: attraction.name,
        attractionType: attraction.type,
        weather: {
          temperature: weather.temperature,
          condition: weather.condition,
          description: weather.description
        },
        recommendation: analysis,
        timestamp: Date.now()
      };
    }
  
    // Core weather impact analysis logic
    analyzeWeatherImpact(attraction, weather) {
      const { type, name } = attraction;
      const { condition, temperature, visibility, windSpeed, cloudiness, humidity } = weather;
      
      // Beach attractions analysis
      if (type === 'beach') {
        return this.analyzeBeachWeather(attraction, weather);
      }
      
      // Nature/Hiking attractions (coastal views, parks)
      if (type === 'nature' || type === 'park' || this.isNatureAttraction(name)) {
        return this.analyzeNatureWeather(attraction, weather);
      }
      
      // Cultural/Temple attractions
      if (type === 'temple' || type === 'cultural') {
        return this.analyzeCulturalWeather(attraction, weather);
      }
      
      // Indoor attractions (markets, shopping, museums)
      if (type === 'market' || type === 'shopping' || type === 'museum' || type === 'mall') {
        return this.analyzeIndoorWeather(attraction, weather);
      }
      
      // Default analysis for other attractions
      return this.getDefaultWeatherAnalysis(weather);
    }
  
    // Beach-specific weather analysis
    analyzeBeachWeather(attraction, weather) {
      const { condition, temperature, windSpeed, cloudiness } = weather;
      
      if (condition === 'clear' && temperature >= 22 && temperature <= 30 && windSpeed < 6 && cloudiness < 30) {
        return {
          status: 'excellent',
          icon: '⭐',
          message: 'Perfect beach weather conditions',
          details: `Ideal ${temperature}°C with clear skies and gentle ${windSpeed}m/s breeze`,
          activities: ['swimming', 'sunbathing', 'beach volleyball', 'photography'],
          crowdMultiplier: 1.8,
          tips: ['Arrive early for best spots', 'Bring sunscreen', 'Perfect for beach photography']
        };
      } else if (condition === 'clouds' && temperature >= 20 && temperature <= 28 && windSpeed < 8) {
        return {
          status: 'good',
          icon: '👍',
          message: 'Good conditions for beach activities',
          details: `Comfortable ${temperature}°C with partial clouds providing some shade`,
          activities: ['walking', 'beach sports', 'café visits'],
          crowdMultiplier: 1.2,
          tips: ['Great for long walks', 'Less crowded than sunny days']
        };
      } else if (condition === 'rain' || temperature < 18) {
        return {
          status: 'poor',
          icon: '⚠️',
          message: 'Weather not suitable for beach activities',
          details: `${temperature}°C with ${condition} conditions`,
          alternative: 'Try indoor attractions like BEXCO shopping or Jagalchi Market',
          crowdMultiplier: 0.3,
          tips: ['Visit covered areas nearby', 'Great time for indoor shopping']
        };
      }
      
      return this.getDefaultWeatherAnalysis(weather);
    }
  
    // Nature/Hiking weather analysis  
    analyzeNatureWeather(attraction, weather) {
      const { condition, temperature, visibility, windSpeed, humidity } = weather;
      
      if (visibility >= 8 && condition !== 'rain' && windSpeed < 10 && humidity < 80) {
        return {
          status: 'excellent',
          icon: '⭐',
          message: 'Excellent conditions for hiking and coastal views',
          details: `Outstanding ${visibility}km visibility, perfect for nature photography and panoramic views`,
          activities: ['hiking', 'photography', 'sightseeing', 'nature walks'],
          crowdMultiplier: 1.3,
          tips: ['Best time for panoramic photos', 'Bring camera for scenic shots', 'Perfect visibility for coastal views']
        };
      } else if (condition === 'clouds' && visibility >= 5 && windSpeed < 12) {
        return {
          status: 'good', 
          icon: '👍',
          message: 'Good conditions for outdoor activities',
          details: `${visibility}km visibility with comfortable temperature for hiking`,
          activities: ['hiking', 'walking', 'exploration'],
          crowdMultiplier: 1.1,
          tips: ['Comfortable for longer hikes', 'Good lighting for photos']
        };
      } else if (condition === 'rain' || windSpeed > 15) {
        return {
          status: 'poor',
          icon: '⚠️',
          message: 'Challenging conditions for outdoor activities',
          details: `${condition} with ${windSpeed}m/s winds - trails may be slippery`,
          alternative: 'Visit covered attractions like Beomeosa Temple or indoor cultural sites',
          crowdMultiplier: 0.4,
          tips: ['Wait for conditions to improve', 'Try indoor alternatives']
        };
      }
      
      return this.getDefaultWeatherAnalysis(weather);
    }
  
    // Cultural/Temple weather analysis
    analyzeCulturalWeather(attraction, weather) {
      const { condition, temperature, cloudiness } = weather;
      
      if (condition === 'clear' && cloudiness < 40) {
        return {
          status: 'excellent',
          icon: '⭐',
          message: 'Perfect conditions for cultural exploration and photography',
          details: `Beautiful clear skies ideal for architectural photography`,
          activities: ['photography', 'cultural tours', 'meditation', 'architecture appreciation'],
          crowdMultiplier: 1.2,
          tips: ['Ideal for temple photography', 'Perfect lighting conditions', 'Great for detailed architectural shots']
        };
      } else if (condition === 'rain') {
        return {
          status: 'good',
          icon: '🏛️',
          message: 'Peaceful atmosphere perfect for cultural immersion',
          details: 'Quieter temples with authentic spiritual atmosphere during rain',
          activities: ['temple visits', 'cultural learning', 'peaceful reflection'],
          crowdMultiplier: 0.6,
          tips: ['Fewer crowds for peaceful experience', 'Authentic temple atmosphere', 'Bring umbrella for courtyard areas']
        };
      }
      
      return this.getDefaultWeatherAnalysis(weather);
    }
  
    // Indoor attractions weather analysis
    analyzeIndoorWeather(attraction, weather) {
      const { condition, temperature } = weather;
      
      if (condition === 'rain' || temperature > 32 || temperature < 8) {
        return {
          status: 'excellent',
          icon: '🏢',
          message: 'Perfect weather for indoor exploration',
          details: `Ideal conditions for comfortable indoor activities and shopping`,
          activities: ['shopping', 'dining', 'cultural experiences', 'market exploration'],
          crowdMultiplier: 1.6, // More people go indoors in bad weather
          tips: ['Great time for market visits', 'Try local indoor specialties', 'Avoid outdoor crowds']
        };
      } else if (condition === 'clear' && temperature >= 20 && temperature <= 28) {
        return {
          status: 'good',
          icon: '👍',
          message: 'Nice weather, but indoor activities still enjoyable',
          details: 'Comfortable for both indoor and outdoor exploration',
          activities: ['shopping', 'dining', 'cultural tours'],
          crowdMultiplier: 0.9,
          tips: ['Consider outdoor alternatives too', 'Good backup option']
        };
      }
      
      return this.getDefaultWeatherAnalysis(weather);
    }
  
    // Helper methods
    isNatureAttraction(name) {
      const natureKeywords = ['태종대', '용두산', '공원', 'park', '산', '해안', 'coastal', '전망'];
      return natureKeywords.some(keyword => name.includes(keyword));
    }
  
    getDefaultWeatherAnalysis(weather) {
      return {
        status: 'neutral',
        icon: '📍',
        message: 'Standard weather conditions for visiting',
        details: `${weather.temperature}°C with ${weather.condition} conditions`,
        activities: ['general sightseeing'],
        crowdMultiplier: 1.0,
        tips: ['Check specific attraction conditions']
      };
    }
  
    // Get weather forecast (5-day)
    async getWeatherForecast() {
      try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${this.busanCoords.lat}&lon=${this.busanCoords.lng}&appid=${this.apiKey}&units=metric`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        return data.list.map(item => ({
          datetime: new Date(item.dt * 1000),
          temperature: Math.round(item.main.temp),
          condition: item.weather[0].main.toLowerCase(),
          description: item.weather[0].description,
          windSpeed: item.wind?.speed || 0,
          cloudiness: item.clouds?.all || 0
        }));
      } catch (error) {
        console.error('Error fetching forecast:', error);
        return [];
      }
    }
  }
  
  // Express.js API routes example
  const setupWeatherRoutes = (app, weatherService) => {
    // Get current weather
    app.get('/api/weather/current', async (req, res) => {
      try {
        const weather = await weatherService.fetchWeatherData();
        res.json({
          success: true,
          data: weather
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  
    // Get weather recommendation for specific attraction
    app.post('/api/weather/recommendation', async (req, res) => {
      try {
        const { attraction } = req.body;
        const weather = await weatherService.fetchWeatherData();
        const recommendation = weatherService.generateWeatherRecommendation(attraction, weather);
        
        res.json({
          success: true,
          data: recommendation
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  
    // Get weather forecast
    app.get('/api/weather/forecast', async (req, res) => {
      try {
        const forecast = await weatherService.getWeatherForecast();
        res.json({
          success: true,
          data: forecast
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  };
  
  // Usage example
  const initializeWeatherService = (apiKey) => {
    const weatherService = new WeatherTourismService(apiKey);
    
    // Example usage
    const exampleUsage = async () => {
      // Get current weather
      const weather = await weatherService.fetchWeatherData();
      console.log('Current weather:', weather);
      
      // Example attraction
      const taejongdae = {
        id: 8,
        name: "태종대",
        nameEn: "Taejongdae Park",
        type: "nature",
        location: { lat: 35.0513, lng: 129.0871 }
      };
      
      // Get weather recommendation
      const recommendation = weatherService.generateWeatherRecommendation(taejongdae, weather);
      console.log('Weather recommendation:', recommendation);
      
      // Example output:
      // {
      //   attractionName: "태종대",
      //   attractionType: "nature", 
      //   recommendation: {
      //     status: "excellent",
      //     icon: "⭐",
      //     message: "Excellent conditions for hiking and coastal views",
      //     details: "Outstanding 10km visibility, perfect for nature photography...",
      //     crowdMultiplier: 1.3
      //   }
      // }
    };
    
    return { weatherService, exampleUsage };
  };
  
  // React Frontend Integration Hook
  const useWeatherRecommendation = () => {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
  
    const fetchWeather = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/weather/current');
        const data = await response.json();
        
        if (data.success) {
          setWeather(data.data);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
  
    const getRecommendation = async (attraction) => {
      try {
        const response = await fetch('/api/weather/recommendation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ attraction }),
        });
        
        const data = await response.json();
        return data.success ? data.data : null;
      } catch (err) {
        console.error('Error getting recommendation:', err);
        return null;
      }
    };
  
    useEffect(() => {
      fetchWeather();
      
      // Refresh weather data every 10 minutes
      const interval = setInterval(fetchWeather, 10 * 60 * 1000);
      return () => clearInterval(interval);
    }, []);
  
    return {
      weather,
      loading,
      error,
      getRecommendation,
      refreshWeather: fetchWeather
    };
  };
  
  // Export only server-side functions
  module.exports = {
    WeatherTourismService,
    setupWeatherRoutes
  };