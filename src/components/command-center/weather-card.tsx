import { CloudRain, CloudOff, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { integrationEnv, isIntegrationConfigured } from "@/lib/env";
import { getWeatherForCoordinates } from "@/lib/integrations/weather";

export async function WeatherCard() {
  if (!isIntegrationConfigured("weather")) {
    return (
      <Card>
        <CardHeader title="Weather" description="Route-planning warnings for today" />
        <CardBody className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <CloudOff className="h-4 w-4 shrink-0" />
          Not connected — add WEATHER_LOCATION_LAT and WEATHER_LOCATION_LON to enable (free, no API key needed).
        </CardBody>
      </Card>
    );
  }

  const lat = Number(integrationEnv.weather.lat);
  const lon = Number(integrationEnv.weather.lon);
  const snapshot = await getWeatherForCoordinates(lat, lon);

  return (
    <Card>
      <CardHeader title="Weather" description={snapshot?.location ?? "Route-planning warnings for today"} />
      <CardBody>
        {!snapshot ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-warning)]">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Couldn&apos;t reach the National Weather Service right now.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">{snapshot.temperatureF}°F</div>
                <div className="text-sm text-[var(--color-text-secondary)]">{snapshot.conditions}</div>
              </div>
              <div className="text-right text-xs text-[var(--color-text-muted)]">
                <div>Wind {snapshot.windMph} mph</div>
                {snapshot.precipitationChance !== null ? <div>{snapshot.precipitationChance}% precip.</div> : null}
              </div>
            </div>
            {snapshot.alerts.length > 0 ? (
              <ul className="space-y-1.5">
                {snapshot.alerts.map((alert) => (
                  <li key={alert.title} className="flex items-center gap-2 text-sm">
                    <Badge tone="warning">
                      <CloudRain className="h-3 w-3" />
                      {alert.severity}
                    </Badge>
                    <span className="text-[var(--color-text-secondary)]">{alert.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">No active weather alerts.</p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
