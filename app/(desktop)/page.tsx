import { DevSceneSwitcher } from "@/components/dev/DevSceneSwitcher";
import { SceneVideo } from "@/components/scene/SceneVideo";
import { DEFAULT_WEATHER, parseWeatherOverride } from "@/lib/scenes";

export default async function DesktopPage({ searchParams }: PageProps<"/">) {
  const { weather: weatherParam } = await searchParams;
  const weather = parseWeatherOverride(weatherParam) ?? DEFAULT_WEATHER;

  return (
    <main className="relative isolate h-dvh overflow-hidden">
      <SceneVideo weather={weather} />
      {process.env.NODE_ENV === "development" && <DevSceneSwitcher current={weather} />}
    </main>
  );
}
