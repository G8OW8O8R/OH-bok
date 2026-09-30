"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scrim } from "@/components/scene/Scrim";
import { SceneSourceProvider } from "@/components/scene/SceneSource";
import { SceneVideo } from "@/components/scene/SceneVideo";
import { Orb } from "@/components/orb/Orb";
import { DepthLayer, ParallaxProvider } from "@/components/ui/Parallax";
import { Greeting } from "@/components/widgets/Greeting";
import { PlayerCapsule } from "@/components/widgets/PlayerCapsule";
import { RecipeOrb } from "@/components/widgets/RecipeOrb";
import { Reminders } from "@/components/widgets/Reminders";
import { ShoppingList } from "@/components/widgets/ShoppingList";
import { WeatherArc } from "@/components/widgets/WeatherArc";
import { BOOT_SAFETY_MS, markBootDone } from "@/lib/boot";
import { dayBrief, greeting, recipePrompt } from "@/lib/brief";
import {
  addIngredients,
  nextReminder,
  SAMPLE_RECIPE,
  SAMPLE_SHOPPING,
  SAMPLE_TRACK,
  sampleReminders,
} from "@/lib/desktop/sample";
import { pluralPl } from "@/lib/plural";
import { SCENE_MEDIA, SCENES, type WeatherState } from "@/lib/scenes";
import type { OrbMode, OrbState } from "@/lib/orb/states";
import { dateIn, hourIn } from "@/lib/time";
import { useNow, useUserTimeZone } from "@/lib/use-now";
import type { WeatherData } from "@/lib/weather/schema";
import { useWeather } from "@/lib/weather/use-weather";
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
  const scene = override ?? weather.current.state;
  const tokens = SCENES[scene].tokens;
  const now = useNow(initialNow);
  const timeZone = useUserTimeZone(weather.timezone);
  const reduceMotion = useReducedMotion();

  const [reminders] = useState(() => sampleReminders(new Date(initialNow)));
  const [shopping, setShopping] = useState(SAMPLE_SHOPPING);
  const [recipeAdded, setRecipeAdded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [called, setCalled] = useState<string | null>(null);
  const timers = useRef<{ call?: number; message?: number }>({});
  /** Podgląd dnia w kuli: najechany (lub z fokusem) dzień ma pierwszeństwo przed przypiętym. */
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [pinnedDay, setPinnedDay] = useState<string | null>(null);

  useEffect(() => {
    const pending = timers.current;
    // Sekwencja startowa (zadanie 5) jeszcze nie istnieje: gdy wideo nie ruszy, start i tak się kończy.
    const bootSafety = window.setTimeout(markBootDone, BOOT_SAFETY_MS);
    return () => {
      window.clearTimeout(pending.call);
      window.clearTimeout(pending.message);
      window.clearTimeout(bootSafety);
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
    const next = addIngredients(shopping, SAMPLE_RECIPE.ingredients);
    const count = next.length - shopping.length;
    setShopping(next);
    setRecipeAdded(true);
    announce(
      count > 0
        ? `Dodano ${count} ${pluralPl(count, ["składnik", "składniki", "składników"])} do listy`
        : "Składniki są już na liście",
    );
    call("shopping");
  };

  const next = nextReminder(reminders, now);
  const today = dateIn(now, weather.timezone);
  const previewDate = hoveredDay ?? pinnedDay;
  const previewDay = weather.daily.find((day) => day.date === previewDate) ?? null;

  return (
    <SceneSourceProvider initialFilter={tokens.videoFilter}>
    <ParallaxProvider>
      <SceneVideo weather={scene} />
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
          <Pill next={next} now={now} message={message} />
          <Clock now={now} timeZone={timeZone} />
        </header>

        <div className="desktop-hero">
          <DepthLayer depth="near">
            <Orb state={orbState} preview={previewDay} today={today} modeOverride={orbMode} />
          </DepthLayer>
          <DepthLayer depth="near">
            <Greeting
              title={greeting(hourIn(now, weather.timezone))}
              brief={dayBrief(weather, now)}
              recipeLabel={recipePrompt(scene, weather.daily[0]?.temperatureMaxC ?? null)}
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
            pinnedDay={pinnedDay}
            onHoverDay={setHoveredDay}
            onTogglePin={(date) => setPinnedDay((current) => (current === date ? null : date))}
          />
          <ShoppingList items={shopping} called={called === "shopping"} />
          <Reminders
            reminders={reminders}
            nextId={next?.id ?? null}
            now={now}
            timeZone={timeZone}
            called={called === "reminders"}
          />
          <RecipeOrb recipe={SAMPLE_RECIPE} added={recipeAdded} onAdd={addRecipe} called={called === "recipe"} />
          <PlayerCapsule track={SAMPLE_TRACK} cover={SCENE_MEDIA[SCENES[scene].video].poster} />
        </div>

        <Dock active="weather" onOpen={call} />
      </div>
    </ParallaxProvider>
    </SceneSourceProvider>
  );
}
