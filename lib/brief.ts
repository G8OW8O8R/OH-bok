import type { WeatherState } from "@/lib/scenes";
import type { HourlyForecast, WeatherData } from "@/lib/weather/schema";
import { formatTime, hourIn } from "@/lib/time";

/** Ile godzin naprzód patrzy brief. */
const BRIEF_WINDOW_H = 12;
/** Od tej ilości opadu (mm/h) godzina jest „mokra”. */
const WET_MM = 0.2;
/** …albo od takiego prawdopodobieństwa, gdy model przewiduje opadową pogodę. */
const WET_PROBABILITY = 60;
const EVENING_FROM = 18;

const WET_STATES: ReadonlySet<WeatherState> = new Set(["drizzle", "rain", "storm", "snow"]);

/** Powitanie zależne od pory dnia. */
export function greeting(hour: number): string {
  return hour >= 5 && hour < EVENING_FROM ? "Dzień dobry." : "Dobry wieczór.";
}

export function isWetHour(hour: HourlyForecast): boolean {
  if (hour.precipitationMm >= WET_MM) return true;
  return WET_STATES.has(hour.state) && (hour.precipitationProbability ?? 0) >= WET_PROBABILITY;
}

function temperature(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value);
  return `${rounded === 0 ? 0 : rounded}°`;
}

/** Godziny od bieżącej (pełna godzina, w której jesteśmy) w oknie briefu. */
function upcomingHours(hourly: HourlyForecast[], now: Date): HourlyForecast[] {
  const from = now.getTime() - 3_600_000;
  const to = now.getTime() + BRIEF_WINDOW_H * 3_600_000;
  return hourly.filter((h) => {
    const t = Date.parse(h.time);
    return t > from && t <= to;
  });
}

/** Najcięższy rodzaj opadu w podanych godzinach: burza > śnieg > deszcz > mżawka. */
function dominantWet(hours: HourlyForecast[]): WeatherState {
  const states = new Set(hours.map((h) => h.state));
  if (states.has("storm")) return "storm";
  if (states.has("snow")) return "snow";
  if (states.has("drizzle") && !states.has("rain")) return "drizzle";
  return "rain";
}

const STARTS: Record<string, string> = {
  storm: "burza, lepiej zostań w środku",
  snow: "pada śnieg, ubierz się ciepło",
  drizzle: "mży, weź parasol",
  rain: "pada, weź parasol",
};

const ONGOING: Record<string, string> = {
  storm: "Burza",
  snow: "Śnieg",
  drizzle: "Mży",
  rain: "Pada",
};

/**
 * Jedno zdanie o najbliższych godzinach, oparte na prognozie godzinowej.
 * Godziny w strefie lokalizacji pogody: „od 14:00 pada” dotyczy tego miejsca.
 */
export function dayBrief(weather: WeatherData, now: Date): string {
  const tz = weather.timezone;
  const evening = hourIn(now, tz) >= EVENING_FROM;
  const [today, tomorrow] = weather.daily;
  const hours = upcomingHours(weather.hourly, now);

  if (hours.length > 0) {
    const firstWet = hours.findIndex(isWetHour);
    const wetNow =
      firstWet === 0 || (WET_STATES.has(weather.current.state) && weather.current.precipitationMmH >= WET_MM);

    if (wetNow) {
      const firstDry = hours.findIndex((h, i) => i > 0 && !isWetHour(h));
      const dry = hours[firstDry];
      const kind = dominantWet(dry ? hours.slice(0, firstDry) : hours);
      if (!dry) return `${ONGOING[kind]} jeszcze długo, weź parasol.`;
      return `${ONGOING[kind]} do ${formatTime(new Date(dry.time), tz)}, potem przejaśnienie.`;
    }

    const wetStart = hours[firstWet];
    if (wetStart) {
      const wet = hours.slice(firstWet).filter(isWetHour);
      return `Od ${formatTime(new Date(wetStart.time), tz)} ${STARTS[dominantWet(wet)]}.`;
    }
  } else if ((today?.precipitationSumMm ?? 0) >= 1 && !evening) {
    // Brak prognozy godzinowej (stara kopia z pamięci): tylko ogólny sygnał z prognozy dziennej.
    const max = temperature(today?.temperatureMaxC);
    return `Dziś deszczowo${max ? `, do ${max}` : ""}. Weź parasol.`;
  }

  if (evening) {
    const max = temperature(tomorrow?.temperatureMaxC);
    return max ? `Wieczór bez deszczu. Jutro do ${max}.` : "Wieczór bez deszczu.";
  }

  const max = temperature(today?.temperatureMaxC);
  const suffix = max ? `, do ${max}` : "";
  switch (weather.current.state) {
    case "sunny":
      return `Słonecznie i sucho${suffix}.`;
    case "fog":
      return `Mgła, uważaj na drodze${suffix}.`;
    default:
      return `Dziś bez deszczu${suffix}.`;
  }
}

/** Druga kapsuła akcji: przepis dopasowany do pogody. */
export function recipePrompt(state: WeatherState, maxC: number | null): string {
  if (state === "rain" || state === "drizzle" || state === "storm") return "Przepis na deszcz";
  if (state === "snow" || (maxC !== null && maxC < 8)) return "Przepis na chłód";
  if (state === "sunny") return "Przepis na słońce";
  return "Przepis na dziś";
}
