import { cookies } from "next/headers";
import { Desktop } from "@/components/system/Desktop";
import { WindowsProvider } from "@/components/system/Windows";
import { parseTimeOverride } from "@/lib/day-period";
import { isDemoValue } from "@/lib/demo/mode";
import { parseOrbModeOverride, parseOrbStateOverride } from "@/lib/orb/states";
import { parseWeatherOverride } from "@/lib/scenes";
import { LOCATION_COOKIE, parseLocationCookie } from "@/lib/weather/coords";
import { getWeather } from "@/lib/weather/service";

export default async function DesktopPage({ searchParams }: PageProps<"/">) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const override = parseWeatherOverride(params.weather);
  const timeOverride = parseTimeOverride(params.time);
  // Dev override stanu i trybu kuli (asystent przejmie stan w zadaniu 7).
  const orbState = parseOrbStateOverride(params.orb);
  const orbMode = parseOrbModeOverride(params["orb-mode"]);
  // Tryb demo (`?demo=1`): wycieczka po pulpicie, bez elementów deweloperskich.
  const demo = isDemoValue(params.demo);
  // Ciasteczko istnieje tylko po zgodzie na lokalizację; bez niego: Gdańsk.
  const coords = parseLocationCookie(cookieStore.get(LOCATION_COOKIE)?.value);
  const { data } = await getWeather(coords);
  // Wspólny punkt startu zegara: klient hydratuje z tą samą chwilą, potem liczy sam.
  const renderedAt = new Date().toISOString();
  // Przełącznik dev tylko w trybie deweloperskim: import za stałym warunkiem nie trafia do paczek produkcji.
  const DevSceneSwitcher =
    process.env.NODE_ENV === "development" && !demo ? (await import("@/components/dev/DevSceneSwitcher")).DevSceneSwitcher : null;

  return (
    <main className="relative isolate min-h-dvh overflow-x-clip desk:h-dvh desk:overflow-hidden">
      {/* Okna z `?app=` otwiera klient po starcie (pozycje są w localStorage), więc SSR ich nie renderuje. */}
      <WindowsProvider>
        <Desktop
          initialWeather={data}
          override={override}
          timeOverride={timeOverride}
          initialNow={renderedAt}
          orbState={orbState ?? "idle"}
          orbMode={orbMode}
          demo={demo}
        />
      </WindowsProvider>
      {DevSceneSwitcher && (
        <DevSceneSwitcher weather={override} time={timeOverride} orbState={orbState} orbMode={orbMode} />
      )}
    </main>
  );
}
