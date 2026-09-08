/**
 * Real weather lookups via the National Weather Service API
 * (api.weather.gov) — US-only, free, and requires no API key at all, just a
 * User-Agent header. Returns null (not fake data) when a location isn't
 * configured — the Command Center should render a "weather not connected"
 * state in that case rather than a placeholder forecast.
 */

export type WeatherSnapshot = {
  location: string;
  temperatureF: number;
  conditions: string;
  windMph: number;
  precipitationChance: number | null;
  alerts: { title: string; severity: string }[];
};

const USER_AGENT = "jarvis-dashboard (weedeater lawn care operations app)";

type PointsResponse = {
  properties: {
    forecast: string;
    relativeLocation?: {
      properties?: { city?: string; state?: string };
    };
  };
};

type ForecastResponse = {
  properties: {
    periods: {
      temperature: number;
      shortForecast: string;
      windSpeed: string;
      probabilityOfPrecipitation?: { value: number | null };
    }[];
  };
};

type AlertsResponse = {
  features: { properties: { event: string; severity: string } }[];
};

function parseWindMph(windSpeed: string): number {
  const match = windSpeed.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export async function getWeatherForCoordinates(
  lat: number,
  lon: number,
): Promise<WeatherSnapshot | null> {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  const headers = { "User-Agent": USER_AGENT, Accept: "application/geo+json" };

  try {
    const pointsRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers });
    if (!pointsRes.ok) return null;
    const points = (await pointsRes.json()) as PointsResponse;

    const [forecastRes, alertsRes] = await Promise.all([
      fetch(points.properties.forecast, { headers }),
      fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, { headers }),
    ]);

    if (!forecastRes.ok) return null;
    const forecast = (await forecastRes.json()) as ForecastResponse;
    const current = forecast.properties.periods[0];
    if (!current) return null;

    let alerts: WeatherSnapshot["alerts"] = [];
    if (alertsRes.ok) {
      const alertsJson = (await alertsRes.json()) as AlertsResponse;
      alerts = alertsJson.features.map((f) => ({ title: f.properties.event, severity: f.properties.severity }));
    }

    const place = points.properties.relativeLocation?.properties;
    const location = place?.city && place?.state ? `${place.city}, ${place.state}` : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

    return {
      location,
      temperatureF: current.temperature,
      conditions: current.shortForecast,
      windMph: parseWindMph(current.windSpeed),
      precipitationChance: current.probabilityOfPrecipitation?.value ?? null,
      alerts,
    };
  } catch {
    return null;
  }
}
