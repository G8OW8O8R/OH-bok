"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scrim } from "@/components/scene/Scrim";
import { SceneSourceProvider } from "@/components/scene/SceneSource";
import { SceneVideo } from "@/components/scene/SceneVideo";
import { WeatherLayers } from "@/components/scene/WeatherLayers";
import { Orb } from "@/components/orb/Orb";
import { RemindersApp } from "@/components/apps/Reminders";
import { ShoppingApp } from "@/components/apps/Shopping";
import { WeatherApp } from "@/components/apps/Weather";
import { DepthLayer, ParallaxProvider } from "@/components/ui/Parallax";
import { Greeting } from "@/components/widgets/Greeting";
import { PlayerCapsule } from "@/components/widgets/PlayerCapsule";
import { RecipeOrb } from "@/components/widgets/RecipeOrb";
import { Reminders } from "@/components/widgets/Reminders";
import { ShoppingList } from "@/components/widgets/ShoppingList";
import { WeatherArc } from "@/components/widgets/WeatherArc";
import { reportBootSignal } from "@/lib/boot";
import { composeBrief, dayBrief, greeting, recipePrompt } from "@/lib/brief";
import { SAMPLE_RECIPE, SAMPLE_TRACK } from "@/lib/desktop/sample";
import { useMarketAlerts } from "@/lib/markets/use-markets";
import { usePlannerSync } from "@/lib/planner/use-planner-sync";
import { pluralPl } from "@/lib/plural";
import { nextReminder, SNOOZE_MINUTES, type Reminder } from "@/lib/reminders/reminders";
import { remainingCount } from "@/lib/shopping/list";
import { dayPeriod, nextPeriodChange, type DayPeriod } from "@/lib/day-period";
import { currentConditions, dayConditions, orbRainStrength } from "@/lib/scene-conditions";
import { sameSceneKey, sceneDuration, scenePace, type SceneKey, type ScenePace } from "@/lib/scene-transition";
import { resolveScene, SCENE_MEDIA, type WeatherState } from "@/lib/scenes";
import type { OrbMode, OrbState } from "@/lib/orb/states";
import { dateIn, formatTime, hourIn } from "@/lib/time";
import { useNow, useUserTimeZone } from "@/lib/use-now";
import type { WeatherData } from "@/lib/weather/schema";
import { useWeather } from "@/lib/weather/use-weather";
import { nextWakeAt, useRemindersStore } from "@/store/reminders";
import { useShoppingStore } from "@/store/shopping";
import { Boot } from "./Boot";
import { Clock } from "./Clock";
import { Dock } from "./Dock";
import { Logo } from "./Logo";
import { Pill } from "./Pill";
import { useWindows, WindowBackdrop } from "./Windows";

interface DesktopProps {
  /** Pogoda z SSR: pierwsza klatka od razu pokazuje właściwą scenę. */
  initialWeather: WeatherData;
  /** `?weather=` ma pierwszeństwo przed prawdziwą pogodą. */
  override: WeatherState | null;
  /** `?time=` ma pierwszeństwo przed porą dnia ze wschodu i zachodu słońca. */
  timeOverride: DayPeriod | null;
  /** Chwila renderu na serwerze (ISO): wspólny punkt startu zegara dla SSR i hydracji. */
  initialNow: string;
  /** Stan kuli (`?orb=`); docelowo sterowany przez asystenta. */
  orbState: OrbState;
  /** `?orb-mode=webgl|fallback` */
  orbMode: OrbMode | null;
}

const CALL_MS = 1200;
const MESSAGE_MS = 4000;

export function Desktop({ initialWeather, override, timeOverride, initialNow, orbState, orbMode }: DesktopProps) {
  const { weather, locating, locationError, locate } = useWeather(initialWeather);
  const daily = weather.daily;
  // Zegar budzi się dokładnie na termin przypomnienia i na zmianę pory dnia.
  const wakeAt = useCallback(
    (nowMs: number) => {
      const candidates = [nextWakeAt(nowMs), nextPeriodChange(new Date(nowMs), daily)?.getTime() ?? null];
      const upcoming = candidates.filter((at): at is number => at !== null);
      return upcoming.length > 0 ? Math.min(...upcoming) : null;
    },
    [daily],
  );
  const now = useNow(initialNow, wakeAt);
  const timeZone = useUserTimeZone(weather.timezone);
  const plannerReady = usePlannerSync(timeZone);
  const reduceMotion = useReducedMotion();

  const reminders = useRemindersStore((state) => state.reminders);
  const shopping = useShoppingStore((state) => state.items);
  const windows = useWindows();
  const windowsOpen = windows.stack.length > 0;
  const [recipeAdded, setRecipeAdded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [called, setCalled] = useState<string | null>(null);
  const timers = useRef<{ call?: number; message?: number }>({});
  /**
   * Podróż w czasie: najechany (lub z fokusem) dzień = podgląd tylko w kuli;
   * kliknięty dzień = cała scena z warstwami i szczegóły w łuku pogody.
   */
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [pinnedDay, setPinnedDay] = useState<string | null>(null);
  const today = dateIn(now, weather.timezone);
  // Dzień znika z prognozy (odświeżenie danych po północy) = powrót do dziś.
  const pinned = pinnedDay === null || pinnedDay === today ? null : (weather.daily.find((day) => day.date === pinnedDay) ?? null);
  const conditions = pinned ? dayConditions(pinned) : currentConditions(weather, override);
  const scene = conditions.state;
  // Pora dnia: prognoza dotyczy dnia, więc przypięty dzień pokazuje wersję dzienną.
  const clockPeriod = timeOverride ?? dayPeriod(now, daily, weather.current.isDay);
  const period: DayPeriod = pinned ? "day" : clockPeriod;
  const resolved = resolveScene(scene, period);
  const periodEnds = timeOverride || pinned ? null : (nextPeriodChange(now, daily)?.toISOString() ?? null);
  const tokens = resolved.tokens;
  // Zmiana samej pory z zegara = wolne przejście (ok. 15 s); każda inna zmiana sceny = 1,4 s.
  const sceneKey: SceneKey = { state: scene, period, pinned: pinned?.date ?? null, timeOverride };
  const [lastKey, setLastKey] = useState(sceneKey);
  const [pace, setPace] = useState<ScenePace>("scene");
  if (!sameSceneKey(lastKey, sceneKey)) {
    setLastKey(sceneKey);
    setPace(scenePace(lastKey, sceneKey));
  }
  const transitionS = sceneDuration(pace, reduceMotion ?? false);
  // Przejścia CSS (scrim, halo, szkło, mgła, pyłki) czytają `--dur-scene`; nadpisane tylko przy
  // wolnym przejściu pory, więc SSR i hydracja mają ten sam atrybut `style`.
  const durationStyle = pace === "period" ? { "--dur-scene": `${Math.round(transitionS * 1000)}ms` } : undefined;
  const shownDate = pinned?.date ?? today;
  const previewDay = hoveredDay === null || hoveredDay === shownDate ? null : (weather.daily.find((day) => day.date === hoveredDay) ?? null);
  const returnToToday = useCallback(() => setPinnedDay(null), []);
  const selectDay = useCallback(
    (date: string) => setPinnedDay((current) => (date === today || current === date ? null : date)),
    [today],
  );

  // Esc wraca do dziś (otwarte okno obsługuje Esc samo).
  useEffect(() => {
    if (pinned === null || windowsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      returnToToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, windowsOpen, returnToToday]);

  useEffect(() => {
    const pending = timers.current;
    // Pogoda przychodzi z SSR, więc przy hydracji dane są już na miejscu (pasek postępu startu).
    reportBootSignal("weather");
    return () => {
      window.clearTimeout(pending.call);
      window.clearTimeout(pending.message);
    };
  }, []);

  /** Akcja „leci do celu”: obiekt docelowy dostaje fokus i krótko się zgłasza. */
  const call = useCallback(
    (id: string) => {
      const target = document.getElementById(id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      setCalled(id);
      window.clearTimeout(timers.current.call);
      timers.current.call = window.setTimeout(() => setCalled(null), CALL_MS);
    },
    [reduceMotion],
  );

  const announce = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timers.current.message);
    timers.current.message = window.setTimeout(() => setMessage(null), MESSAGE_MS);
  }, []);

  // Alerty cenowe: spełniony alert = komunikat w pigułce.
  useMarketAlerts(announce);

  const addRecipe = () => {
    const count = useShoppingStore.getState().add(SAMPLE_RECIPE.ingredients);
    setRecipeAdded(true);
    announce(
      count > 0
        ? `Dodano ${count} ${pluralPl(count, ["składnik", "składniki", "składników"])} do listy`
        : "Składniki są już na liście",
    );
    call("shopping");
  };

  const next = nextReminder(reminders);
  const remaining = remainingCount(shopping);

  const snooze = (reminder: Reminder) => {
    // Odliczanie w pigułce liczy od `now` (tyka co 10 s): drzemka od tej samej chwili daje równe „Za 10 min”.
    const snoozedAt = Date.now() - now.getTime() < 15_000 ? now : new Date();
    const at = new Date(snoozedAt.getTime() + SNOOZE_MINUTES * 60_000);
    useRemindersStore.getState().snooze(reminder.id, snoozedAt);
    announce(`Odłożono: ${reminder.title}, o ${formatTime(at, timeZone)}`);
  };
  const complete = (reminder: Reminder) => useRemindersStore.getState().complete(reminder.id);

  return (
    <SceneSourceProvider initialGrade={tokens}>
    <ParallaxProvider>
      <SceneVideo weather={scene} period={period} periodEnds={periodEnds} scene={resolved} transitionS={transitionS}>
        <WeatherLayers
          conditions={conditions}
          effects={resolved.effects}
          period={period}
          transitionS={transitionS}
          durationStyle={durationStyle}
        />
      </SceneVideo>
      <Scrim strength={tokens.scrimStrength} vignette={tokens.vignetteStrength} durationStyle={durationStyle} />
      <div
        className="desktop"
        data-windows={windowsOpen || undefined}
        style={{
          ...durationStyle,
          "--halo-strength": tokens.haloStrength,
          "--glass-bg": tokens.glassTint,
          "--glass-blur": `${tokens.glassBlur}px`,
          "--glass-text-shadow": tokens.glassTextShadow,
          "--scene-text-shadow": tokens.textShadow,
        }}
      >
        {/* Pod otwartym oknem pulpit jest nieaktywny (fokus, klik, czytniki); dock zostaje dostępny. */}
        <header className="desktop-chrome" inert={windowsOpen}>
          <Logo />
          <Pill
            next={next}
            now={now}
            message={message}
            ready={plannerReady}
            timeZone={timeZone}
            onSnooze={snooze}
            onComplete={complete}
          />
          <Clock now={now} timeZone={timeZone} />
        </header>

        <div className="desktop-hero" inert={windowsOpen}>
          <DepthLayer depth="near">
            <Orb
              state={orbState}
              preview={previewDay}
              rain={orbRainStrength(conditions.state, conditions.intensityMmH)}
              today={today}
              modeOverride={orbMode}
            />
          </DepthLayer>
          <DepthLayer depth="near" className="desktop-hero-text">
            <Greeting
              title={greeting(hourIn(now, weather.timezone))}
              brief={
                plannerReady
                  ? composeBrief(dayBrief(weather, now), { remaining, next, now, timeZone }, dayBrief(weather, now, true))
                  : dayBrief(weather, now)
              }
              recipeLabel={recipePrompt(override ?? weather.current.state, weather.daily[0]?.temperatureMaxC ?? null)}
              onPlan={() => call("reminders")}
              onRecipe={() => call("recipe")}
            />
          </DepthLayer>
        </div>

        <div className="desktop-objects" inert={windowsOpen}>
          <WeatherArc
            weather={weather}
            override={override}
            locating={locating}
            locationError={locationError}
            onLocate={locate}
            now={now}
            timeZone={timeZone}
            called={called === "weather"}
            selectedDay={pinned}
            onHoverDay={setHoveredDay}
            onSelectDay={selectDay}
            onReturnToday={returnToToday}
          />
          <ShoppingList items={shopping} called={called === "shopping"} onOpen={() => windows.open("shopping", "tile")} />
          <Reminders
            reminders={reminders}
            nextId={next?.id ?? null}
            now={now}
            timeZone={timeZone}
            called={called === "reminders"}
            onOpen={() => windows.open("reminders", "tile")}
          />
          <RecipeOrb recipe={SAMPLE_RECIPE} added={recipeAdded} onAdd={addRecipe} called={called === "recipe"} />
          <PlayerCapsule track={SAMPLE_TRACK} cover={SCENE_MEDIA[resolved.video].poster} />
        </div>

        <WindowBackdrop />
        <Dock />

        <WeatherApp
          weather={weather}
          now={now}
          timeZone={timeZone}
          today={today}
          shownDate={shownDate}
          onShow={(date) => {
            setPinnedDay(date === today ? null : date);
            windows.close("weather");
          }}
        />
        <ShoppingApp
          items={shopping}
          onAdd={(name) => useShoppingStore.getState().add([name])}
          onToggle={(id) => useShoppingStore.getState().toggle(id)}
          onRemove={(id) => useShoppingStore.getState().remove(id)}
        />
        <RemindersApp
          reminders={reminders}
          now={now}
          timeZone={timeZone}
          onAdd={(input) => useRemindersStore.getState().add(input)}
          onRemove={(id) => useRemindersStore.getState().remove(id)}
        />
      </div>
      <Boot />
    </ParallaxProvider>
    </SceneSourceProvider>
  );
}
