"use client";

import { Scrim } from "@/components/scene/Scrim";
import { SceneVideo } from "@/components/scene/SceneVideo";
import { WeatherCapsule } from "@/components/widgets/WeatherCapsule";
import { SCENES, type WeatherState } from "@/lib/scenes";
import type { WeatherData } from "@/lib/weather/schema";
import { useWeather } from "@/lib/weather/use-weather";

interface DesktopProps {
  /** Pogoda z SSR: pierwsza klatka od razu pokazuje właściwą scenę. */
  initialWeather: WeatherData;
  /** `?weather=` ma pierwszeństwo przed prawdziwą pogodą. */
  override: WeatherState | null;
}

export function Desktop({ initialWeather, override }: DesktopProps) {
  const { weather, locating, locationError, locate } = useWeather(initialWeather);
  const scene = override ?? weather.current.state;

  return (
    <>
      <SceneVideo weather={scene} />
      <Scrim strength={SCENES[scene].tokens.scrimStrength} />
      <WeatherCapsule
        weather={weather}
        override={override}
        locating={locating}
        locationError={locationError}
        onLocate={locate}
      />
    </>
  );
}
