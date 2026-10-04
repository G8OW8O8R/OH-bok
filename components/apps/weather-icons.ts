import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { WeatherState } from "@/lib/scenes";

/**
 * Liniowe ikony pogody (Lucide), spójne z dockiem. Kod WMO 2 (częściowe zachmurzenie) dostaje
 * chmurę ze słońcem albo księżycem; bez kodu (prognoza godzinowa) – sam stan.
 */
export function weatherIcon(state: WeatherState, isDay: boolean, code: number | null = null): LucideIcon {
  switch (state) {
    case "sunny":
      return isDay ? Sun : Moon;
    case "cloudy":
      if (code === 2) return isDay ? CloudSun : CloudMoon;
      return Cloud;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
      return CloudRain;
    case "snow":
      return CloudSnow;
    case "storm":
      return CloudLightning;
  }
}
