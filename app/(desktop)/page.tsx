import { cookies } from "next/headers";
import { DevSceneSwitcher } from "@/components/dev/DevSceneSwitcher";
import { Desktop } from "@/components/system/Desktop";
import { parseWeatherOverride } from "@/lib/scenes";
import { LOCATION_COOKIE, parseLocationCookie } from "@/lib/weather/coords";
import { getWeather } from "@/lib/weather/service";

export default async function DesktopPage({ searchParams }: PageProps<"/">) {
  const [{ weather: weatherParam }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const override = parseWeatherOverride(weatherParam);
  // Ciasteczko istnieje tylko po zgodzie na lokalizację; bez niego: Gdańsk.
  const coords = parseLocationCookie(cookieStore.get(LOCATION_COOKIE)?.value);
  const { data } = await getWeather(coords);

  return (
    <main className="relative isolate h-dvh overflow-hidden">
      <Desktop initialWeather={data} override={override} />
      {process.env.NODE_ENV === "development" && <DevSceneSwitcher current={override} />}
    </main>
  );
}
