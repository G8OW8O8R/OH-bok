"use client";

import { motion, useMotionValue, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scrim } from "@/components/scene/Scrim";
import { SceneSourceProvider } from "@/components/scene/SceneSource";
import { SceneVideo } from "@/components/scene/SceneVideo";
import { WeatherLayers } from "@/components/scene/WeatherLayers";
import { OrbFlightProvider } from "@/components/orb/flight";
import { Orb } from "@/components/orb/Orb";
import { DepthLayer, ParallaxProvider } from "@/components/ui/Parallax";
import { Greeting } from "@/components/widgets/Greeting";
import { News } from "@/components/widgets/News";
import { PlayerCapsule } from "@/components/widgets/PlayerCapsule";
import { Reminders } from "@/components/widgets/Reminders";
import { ShoppingList } from "@/components/widgets/ShoppingList";
import { WeatherArc } from "@/components/widgets/WeatherArc";
import { isBootDone, reportBootSignal } from "@/lib/boot";
import { composeBrief, dayBrief, greeting } from "@/lib/brief";
import { DEMO_PARAM } from "@/lib/demo/mode";
import { DEMO_FIRST_STRIKE_MS } from "@/lib/demo/script";
import { resetDemoData, restoreUserData } from "@/lib/demo/session";
import { useDemoTour } from "@/lib/demo/use-demo";
import { useMarketAlerts } from "@/lib/markets/use-markets";
import type { NewsCategory } from "@/lib/news/sources";
import { useNews } from "@/lib/news/use-news";
import { usePlannerSync } from "@/lib/planner/use-planner-sync";
import { nextReminder, SNOOZE_MINUTES, type Reminder } from "@/lib/reminders/reminders";
import { remainingCount } from "@/lib/shopping/list";
import { dayPeriod, nextPeriodChange, type DayPeriod } from "@/lib/day-period";
import { currentConditions, dayConditions, orbRainStrength } from "@/lib/scene-conditions";
import { sameSceneKey, sceneDuration, scenePace, type SceneKey, type ScenePace } from "@/lib/scene-transition";
import { glassFill, resolveScene, SCENE_MEDIA, type WeatherState } from "@/lib/scenes";
import type { OrbMode, OrbState } from "@/lib/orb/states";
import { dateIn, formatTime, hourIn } from "@/lib/time";
import { useIdleAfterBoot } from "@/lib/use-idle";
import { useNow, useUserTimeZone } from "@/lib/use-now";
import type { WeatherData } from "@/lib/weather/schema";
import { useWeather } from "@/lib/weather/use-weather";
import { APP_PARAM } from "@/lib/windows/url";
import { nextWakeAt, useRemindersStore } from "@/store/reminders";
import { useMusicStore } from "@/store/music";
import { useShoppingStore } from "@/store/shopping";
import { Boot } from "./Boot";
import { Clock } from "./Clock";
import { Dock } from "./Dock";
import { Logo } from "./Logo";
import { Pill } from "./Pill";
import type { AssistantOrbState, SpotlightPhase } from "./Spotlight";
import { replaceSearchParams, useWindows, WindowBackdrop } from "./Windows";

/*
 * Okna aplikacji i Spotlight poza pakietem startowym: okna i tak nie są renderowane przez SSR
 * (pozycje w localStorage), a pulpit hydratuje się szybciej. Kod wczytuje się w bezczynności
 * po starcie (`useIdleAfterBoot`) albo od razu, gdy ktoś otworzy okno lub Spotlight wcześniej.
 */
const WeatherApp = dynamic(() => import("@/components/apps/Weather").then((module) => module.WeatherApp), { ssr: false });
const ShoppingApp = dynamic(() => import("@/components/apps/Shopping").then((module) => module.ShoppingApp), { ssr: false });
const RemindersApp = dynamic(() => import("@/components/apps/Reminders").then((module) => module.RemindersApp), { ssr: false });
const MarketsApp = dynamic(() => import("@/components/apps/Markets").then((module) => module.MarketsApp), { ssr: false });
const NewsApp = dynamic(() => import("@/components/apps/News").then((module) => module.NewsApp), { ssr: false });
const AboutApp = dynamic(() => import("@/components/apps/About").then((module) => module.AboutApp), { ssr: false });
const Spotlight = dynamic(() => import("./Spotlight").then((module) => module.Spotlight), { ssr: false });

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
  /** `?demo=1`: automatyczna wycieczka na danych w pamięci. */
  demo: boolean;
}

const CALL_MS = 1200;
const MESSAGE_MS = 4000;

export function Desktop({ initialWeather, override: urlOverride, timeOverride: urlTimeOverride, initialNow, orbState, orbMode, demo: demoRequested }: DesktopProps) {
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

  /*
   * Tryb demo: scenariusz steruje sceną, porą, podglądem w kuli, Spotlightem i oknami.
   * Pierwsza interakcja kończy demo – dane użytkownika wracają z localStorage (demo pisało do pamięci).
   */
  const [demoActive, setDemoActive] = useState(demoRequested);

  const news = useNews();
  /** Kategoria wiadomości wspólna dla widgetu i okna. */
  const [newsCategory, setNewsCategory] = useState<NewsCategory>("polska");

  const reminders = useRemindersStore((state) => state.reminders);
  const shopping = useShoppingStore((state) => state.items);
  const windows = useWindows();
  const windowsOpen = windows.stack.length > 0;
  // Kod okien i Spotlightu: w bezczynności po starcie albo od pierwszego otwarcia (potem zostaje,
  // żeby zamykane okno dokończyło animację wyjścia).
  const idle = useIdleAfterBoot();
  const [appsWanted, setAppsWanted] = useState(false);
  /**
   * Spotlight: „open” – panel i kula u góry; „closing” – kula wraca na miejsce
   * (pulpit już aktywny, kula jeszcze nad tłem); „closed”.
   */
  const [spotlight, setSpotlight] = useState<SpotlightPhase>("closed");
  const [assistantState, setAssistantState] = useState<AssistantOrbState>(null);
  const spotlightOpen = spotlight === "open";
  if (!appsWanted && (windowsOpen || spotlight !== "closed")) setAppsWanted(true);
  const appsLoaded = idle || appsWanted;
  const desktopInert = windowsOpen || spotlightOpen;
  const flightX = useMotionValue(0);
  const flightY = useMotionValue(0);
  const flightOpacity = useMotionValue(1);
  const flight = useMemo(() => ({ x: flightX, y: flightY, opacity: flightOpacity }), [flightX, flightY, flightOpacity]);
  const orbAnchor = useRef<HTMLDivElement>(null);
  const spotlightOpener = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [called, setCalled] = useState<string | null>(null);
  const timers = useRef<{ call?: number; message?: number }>({});
  /**
   * Podróż w czasie: najechany (lub z fokusem) dzień = podgląd tylko w kuli;
   * kliknięty dzień = cała scena z warstwami i szczegóły w łuku pogody.
   */
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [pinnedDay, setPinnedDay] = useState<string | null>(null);

  const openSpotlight = useCallback(() => {
    // Do końca startu kula leci z logo – Spotlight dopiero potem.
    if (!isBootDone()) return;
    spotlightOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSpotlight("open");
  }, []);

  const closeSpotlight = useCallback(() => {
    setSpotlight((phase) => (phase === "open" ? "closing" : phase));
    // Fokus wraca od razu (pulpit przestaje być inert już w „closing”); okno otwarte z wyniku
    // i tak przejmie fokus w następnej klatce.
    requestAnimationFrame(() => {
      const opener = spotlightOpener.current;
      // Otwarcie skrótem bez fokusu (body) – fokus na kulę, z której Spotlight „wyszedł”.
      const target = opener?.isConnected && opener !== document.body ? opener : document.getElementById("orb-button");
      target?.focus({ preventScroll: true });
    });
  }, []);

  const exitDemo = useCallback(() => {
    setDemoActive(false);
    setHoveredDay(null);
    closeSpotlight();
    // Okna demo nie mają wpisów w historii: znikają razem z parametrem `app`.
    replaceSearchParams((params) => {
      params.delete(DEMO_PARAM);
      params.delete(APP_PARAM);
    });
    void restoreUserData(new Date(), timeZone);
  }, [closeSpotlight, timeZone]);
  const demo = useDemoTour(demoActive, reduceMotion ?? false, exitDemo);
  const override = demo ? demo.weather : urlOverride;
  const timeOverride = demo ? demo.time : urlTimeOverride;

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
  const glass = useMemo(() => glassFill(tokens.glassTint), [tokens.glassTint]);
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
  // W demo podgląd dnia w kuli prowadzi scenariusz (przesunięcie od dziś w prognozie).
  const hovered = demo ? (demo.previewDay === null ? null : (daily[demo.previewDay]?.date ?? null)) : hoveredDay;
  const previewDay = hovered === null || hovered === shownDate ? null : (daily.find((day) => day.date === hovered) ?? null);
  const returnToToday = useCallback(() => setPinnedDay(null), []);
  const selectDay = useCallback(
    (date: string) => setPinnedDay((current) => (date === today || current === date ? null : date)),
    [today],
  );

  // Muzyka: nastrój z pogody za oknem i pory z zegara (nie z dnia oglądanego w prognozie).
  const liveWeather = currentConditions(weather, override).state;
  useEffect(() => {
    useMusicStore.getState().setScene(liveWeather, clockPeriod);
  }, [liveWeather, clockPeriod]);

  // Esc wraca do dziś (otwarte okno obsługuje Esc samo).
  useEffect(() => {
    if (pinned === null || desktopInert) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      returnToToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, desktopInert, returnToToday]);

  const spotlightClosed = useCallback(() => setSpotlight((phase) => (phase === "closing" ? "closed" : phase)), []);

  // Cmd/Ctrl+K (w otwartym Spotlighcie klawisze obsługuje panel; Esc tutaj, gdy fokus wypadł z panelu).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && spotlight === "open" && !event.defaultPrevented) {
        event.preventDefault();
        closeSpotlight();
        return;
      }
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      event.preventDefault();
      if (spotlight === "open") closeSpotlight();
      else openSpotlight();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spotlight, openSpotlight, closeSpotlight]);

  // --- Tryb demo: Spotlight, okna i świeże dane na każde okrążenie ---------------------------------

  const demoLoop = demo?.loop ?? null;
  useEffect(() => {
    if (demoLoop !== null) resetDemoData(new Date(), timeZone);
    // Strefa liczy się tylko przy wstawianiu przykładowych przypomnień.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoLoop]);

  const demoSpotlight = demo?.spotlight ?? null;
  const demoSpotlightWas = useRef(false);
  useEffect(() => {
    if (demoSpotlight === null) return;
    const was = demoSpotlightWas.current;
    demoSpotlightWas.current = demoSpotlight;
    if (demoSpotlight && !was) openSpotlight();
    if (!demoSpotlight && was) closeSpotlight();
  }, [demoSpotlight, openSpotlight, closeSpotlight]);

  const demoWindow = demo ? demo.window : undefined;
  const { stack: windowStack, open: openWindow, close: closeWindow } = windows;
  useEffect(() => {
    if (demoWindow === undefined) return;
    for (const id of windowStack) if (id !== demoWindow) closeWindow(id);
    // Bez wpisów w historii: „wstecz” po demo nie przechodzi przez jego okna.
    if (demoWindow && !windowStack.includes(demoWindow)) openWindow(demoWindow, "dock", { history: "replace" });
  }, [demoWindow, windowStack, openWindow, closeWindow]);

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
    <ParallaxProvider paused={spotlight !== "closed"}>
      <SceneVideo weather={scene} period={period} periodEnds={periodEnds} scene={resolved} transitionS={transitionS}>
        <WeatherLayers
          conditions={conditions}
          effects={resolved.effects}
          period={period}
          transitionS={transitionS}
          durationStyle={durationStyle}
          firstStrikeMs={demo ? DEMO_FIRST_STRIKE_MS : undefined}
        />
      </SceneVideo>
      <Scrim strength={tokens.scrimStrength} vignette={tokens.vignetteStrength} durationStyle={durationStyle} />
      <div
        className="desktop"
        data-windows={windowsOpen || undefined}
        data-spotlight={spotlightOpen || undefined}
        style={{
          ...durationStyle,
          "--halo-strength": tokens.haloStrength,
          "--glass-rgb": glass.rgb,
          "--glass-alpha": glass.alpha,
          "--glass-blur": `${tokens.glassBlur}px`,
          "--glass-text-shadow": tokens.glassTextShadow,
          "--scene-text-shadow": tokens.textShadow,
        }}
      >
        {/* Pod otwartym oknem pulpit jest nieaktywny (fokus, klik, czytniki); dock zostaje dostępny. */}
        <header className="desktop-chrome" inert={desktopInert}>
          <Logo onOpen={() => windows.open("about", "tile")} />
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

        <div className="desktop-hero" inert={desktopInert}>
          <DepthLayer depth="near" data-orb-lifted={spotlightOpen || (spotlight === "closing" && !windowsOpen) || undefined}>
            {/* Przelot do Spotlightu: przesuwa się ta sama kula (WebGL dolicza przesunięcie do próbkowania sceny). */}
            <motion.div ref={orbAnchor} style={{ x: flightX, y: flightY, opacity: flightOpacity }}>
              <OrbFlightProvider value={flight}>
                <Orb
                  state={spotlight === "closed" ? orbState : (assistantState ?? "listening")}
                  preview={previewDay}
                  rain={orbRainStrength(conditions.state, conditions.intensityMmH)}
                  today={today}
                  modeOverride={orbMode}
                  onActivate={openSpotlight}
                  expanded={spotlightOpen}
                />
              </OrbFlightProvider>
            </motion.div>
          </DepthLayer>
          <DepthLayer depth="near" className="desktop-hero-text">
            <Greeting
              title={greeting(hourIn(now, weather.timezone))}
              brief={
                plannerReady
                  ? composeBrief(dayBrief(weather, now), { remaining, next, now, timeZone }, dayBrief(weather, now, true))
                  : dayBrief(weather, now)
              }
              onPlan={() => call("reminders")}
            />
          </DepthLayer>
        </div>

        <div className="desktop-objects" inert={desktopInert}>
          <WeatherArc
            weather={weather}
            override={urlOverride}
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
          <News
            digest={news.digest}
            category={newsCategory}
            onCategory={setNewsCategory}
            now={now}
            timeZone={timeZone}
            onOpen={() => windows.open("news", "tile")}
          />
          <PlayerCapsule cover={SCENE_MEDIA[resolved.video]} />
        </div>

        <WindowBackdrop />
        {demoActive && (
          <p role="status" className="demo-badge scene-text fixed z-[95] rounded-pill px-3.5 py-1.5 text-caption text-text-primary" data-testid="demo-badge">
            <span aria-hidden className="mr-2 inline-block size-1.5 rounded-full bg-amber align-middle" />
            Tryb demo <span aria-hidden>·</span> <span className="pointer-coarse:hidden">Esc, aby wyjść</span>
            <span className="hidden pointer-coarse:inline">dotknij, aby wyjść</span>
          </p>
        )}
        <div inert={spotlightOpen} className="contents">
          <Dock onSearch={openSpotlight} searchOpen={spotlightOpen} />
        </div>

        {appsLoaded && (
          <>
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
            <MarketsApp now={now} timeZone={timeZone} />
            <NewsApp digest={news.digest} category={newsCategory} onCategory={setNewsCategory} now={now} timeZone={timeZone} />
            <AboutApp timeZone={timeZone} />
            <Spotlight
              phase={spotlight}
              onRequestClose={closeSpotlight}
              onClosed={spotlightClosed}
              orbAnchor={orbAnchor}
              flight={flight}
              now={now}
              timeZone={timeZone}
              weather={weather}
              onAssistant={setAssistantState}
              onPinDay={(date) => setPinnedDay(date === today ? null : date)}
              announce={announce}
              script={demo?.spotlight ? { typed: demo.typed, submitted: demo.submitted } : null}
            />
          </>
        )}
      </div>
      <Boot />
    </ParallaxProvider>
    </SceneSourceProvider>
  );
}
