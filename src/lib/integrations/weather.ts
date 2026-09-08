import { integrationEnv, isIntegrationConfigured } from "@/lib/env";

/**
 * Real weather lookups via OpenWeatherMap's current-weather + alerts
 * endpoints. Returns null (not fake data) when WEATHER_API_KEY isn't set —
 * the Command Center / Schedule pages should render a "weather not
 * connected" state in that case rather than a placeholder forecast.
 */

export type WeatherSnapshot = {
  location: string;
  temperatureF: number;
  conditions: string;
  windMph: number;
  precipitationChance: number | null;
  alerts: { title: string; severity: string }[];
};

const CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const ONE_CALL_URL = "https://api.openweathermap.org/data/3.0/onecall";

export async function getWeatherForCoordinates(
  lat: number,
  lon: number,
): Promise<WeatherSnapshot | null> {
  if (!isIntegrationConfigured("weather")) return null;

  const apiKey = integrationEnv.weather.apiKey;

  try {
    const currentRes = await fetch(
      `${CURRENT_WEATHER_URL}?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`,
    );
    if (!currentRes.ok) return null;
    const current = await currentRes.json();

    let alerts: WeatherSnapshot["alerts"] = [];
    let precipitationChance: number | null = null;
    try {
      const oneCallRes = await fetch(
        `${ONE_CALL_URL}?lat=${lat}&lon=${lon}&units=imperial&exclude=minutely,hourly&appid=${apiKey}`,
      );
      if (oneCallRes.ok) {
        const oneCall = await oneCallRes.json();
        alerts = (oneCall.alerts ?? []).map((a: { event: string; severity?: string }) => ({
          title: a.event,
          severity: a.severity ?? "advisory",
        }));
        precipitationChance = oneCall.daily?.[0]?.pop ? Math.round(oneCall.daily[0].pop * 100) : null;
      }
    } catch {
      // One Call is a paid-tier endpoint on some plans — current conditions
      // still render without it, just without alerts/precipitation chance.
    }

    return {
      location: current.name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      temperatureF: Math.round(current.main?.temp ?? 0),
      conditions: current.weather?.[0]?.main ?? "Unknown",
      windMph: Math.round(current.wind?.speed ?? 0),
      precipitationChance,
      alerts,
    };
  } catch {
    return null;
  }
}
