"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scrim } from "@/components/scene/Scrim";
import { SceneSourceProvider } from "@/components/scene/SceneSource";
import { SceneVideo } from "@/components/scene/SceneVideo";
import { WeatherLayers } from "@/components/scene/WeatherLayers";
import { Orb } from "@/components/orb/Orb";
import { DepthLayer, ParallaxProvider } from "@/components/ui/Parallax";
import { Greeting } from "@/components/widgets/Greeting";
import { PlayerCapsule } from "@/components/widgets/PlayerCapsule";
import { RecipeOrb } from "@/components/widgets/RecipeOrb";
import { Reminders } from "@/components/widgets/Reminders";
import { RemindersPanel } from "@/components/widgets/RemindersPanel";
import { ShoppingList } from "@/components/widgets/ShoppingList";
import { ShoppingPanel } from "@/components/widgets/ShoppingPanel";
import { WeatherArc } from "@/components/widgets/WeatherArc";
import { reportBootSignal } from "@/lib/boot";
import { composeBrief, dayBrief, greeting, recipePrompt } from "@/lib/brief";
import { SAMPLE_RECIPE, SAMPLE_TRACK } from "@/lib/desktop/sample";
import { usePlannerSync } from "@/lib/planner/use-planner-sync";
import { pluralPl } from "@/lib/plural";
import { nextReminder, SNOOZE_MINUTES, type Reminder } from "@/lib/reminders/reminders";
import { remainingCount } from "@/lib/shopping/list";
import { currentConditions, dayConditions, orbRainStrength } from "@/lib/scene-conditions";
import { SCENE_MEDIA, SCENES, type WeatherState } from "@/lib/scenes";
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

interface DesktopProps {
  /** Pogoda z SSR: pierwsza klatka od razu pokazuje właściwą scenę. */
  initialWeather: WeatherData;
  /** `?weather=` ma pierwszeństwo przed prawdziwą pogodą. */
  override: WeatherState | null;
  /** Chwila renderu na serwerze (ISO): wspólny punkt startu zegara dla SSR i hydracji. */
  initialNow: string;
  /** Stan kuli (`?orb=`); docelowo sterowany przez asystenta. */
  orbState: OrbState;
  /** `?orb-mode=webgl|fallback` */
  orbMode: OrbMode | null;
}

const CALL_MS = 1200;
const MESSAGE_MS = 4000;

export function Desktop({ initialWeather, override, initialNow, orbState, orbMode }: DesktopProps) {
  const { weather, locating, locationError, locate } = useWeather(initialWeather);
  const now = useNow(initialNow, nextWakeAt);
  const timeZone = useUserTimeZone(weather.timezone);
  const plannerReady = usePlannerSync(timeZone);
  const reduceMotion = useReducedMotion();

  const reminders = useRemindersStore((state) => state.reminders);
  const shopping = useShoppingStore((state) => state.items);
  const [panel, setPanel] = useState<"shopping" | "reminders" | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
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
  const tokens = SCENES[scene].tokens;
  const shownDate = pinned?.date ?? today;
  const previewDay = hoveredDay === null || hoveredDay === shownDate ? null : (weather.daily.find((day) => day.date === hoveredDay) ?? null);
  const returnToToday = useCallback(() => setPinnedDay(null), []);
  const selectDay = useCallback(
    (date: string) => setPinnedDay((current) => (date === today || current === date ? null : date)),
    [today],
  );

  // Esc wraca do dziś (otwarty panel obsługuje Esc sam).
  useEffect(() => {
    if (pinned === null || panel !== null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      returnToToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, panel, returnToToday]);

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
    <SceneSourceProvider initialFilter={tokens.videoFilter}>
    <ParallaxProvider>
      <SceneVideo weather={scene}>
        <WeatherLayers conditions={conditions} />
      </SceneVideo>
      <Scrim strength={tokens.scrimStrength} vignette={tokens.vignetteStrength} />
      <div
        className="desktop"
        style={{
          "--halo-strength": tokens.haloStrength,
          "--glass-bg": tokens.glassTint,
          "--glass-blur": `${tokens.glassBlur}px`,
          "--glass-text-shadow": tokens.glassTextShadow,
          "--scene-text-shadow": tokens.textShadow,
        }}
      >
        <header className="desktop-chrome">
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

        <div className="desktop-hero">
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

        <div className="desktop-objects">
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
          <ShoppingList items={shopping} called={called === "shopping"} onOpen={() => setPanel("shopping")} />
          <Reminders
            reminders={reminders}
            nextId={next?.id ?? null}
            now={now}
            timeZone={timeZone}
            called={called === "reminders"}
            onOpen={() => setPanel("reminders")}
          />
          <RecipeOrb recipe={SAMPLE_RECIPE} added={recipeAdded} onAdd={addRecipe} called={called === "recipe"} />
          <PlayerCapsule track={SAMPLE_TRACK} cover={SCENE_MEDIA[SCENES[scene].video].poster} />
        </div>

        <Dock active="weather" onOpen={call} />

        <ShoppingPanel
          open={panel === "shopping"}
          onClose={closePanel}
          items={shopping}
          onAdd={(name) => useShoppingStore.getState().add([name])}
          onToggle={(id) => useShoppingStore.getState().toggle(id)}
          onRemove={(id) => useShoppingStore.getState().remove(id)}
        />
        <RemindersPanel
          open={panel === "reminders"}
          onClose={closePanel}
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
