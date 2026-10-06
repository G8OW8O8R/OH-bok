import { describe, expect, it } from "vitest";
import { posterUrl, rememberPosterFormat, shouldUseAv1 } from "@/lib/scene-media";
import { glassFill, SCENE_MEDIA, SCENES } from "@/lib/scenes";
import { formatter, formatTime } from "@/lib/time";

describe("wybór AV1", () => {
  it("tylko przy płynnym i energooszczędnym dekodowaniu", () => {
    expect(shouldUseAv1({ supported: true, smooth: true, powerEfficient: true })).toBe(true);
    // Programowy dav1d: działa, ale kosztuje CPU – zostaje H.264.
    expect(shouldUseAv1({ supported: true, smooth: true, powerEfficient: false })).toBe(false);
    expect(shouldUseAv1({ supported: true, smooth: false, powerEfficient: true })).toBe(false);
    expect(shouldUseAv1({ supported: false, smooth: false, powerEfficient: false })).toBe(false);
    expect(shouldUseAv1(null)).toBe(false);
  });
});

describe("format posteru", () => {
  const media = SCENE_MEDIA.rain;

  it("każda scena ma AV1 i postery AVIF/WebP obok oryginałów", () => {
    for (const scene of Object.values(SCENE_MEDIA)) {
      expect(scene.videoAv1).toBe(scene.video.replace(/\.mp4$/, ".av1.mp4"));
      expect(scene.posterAvif).toBe(scene.poster.replace(/\.jpg$/, ".avif"));
      expect(scene.posterWebp).toBe(scene.poster.replace(/\.jpg$/, ".webp"));
    }
  });

  it("bez wiedzy o formacie – JPG; potem format wybrany przez <picture>", () => {
    expect(posterUrl(media, null)).toBe(media.poster);
    rememberPosterFormat("http://localhost:3000/scenes/cloudy-lighthouse/poster.avif");
    expect(posterUrl(media)).toBe(media.posterAvif);
    rememberPosterFormat("http://localhost:3000/scenes/cloudy-lighthouse/poster.webp");
    expect(posterUrl(media)).toBe(media.posterWebp);
    // Nieznany adres nie zmienia zapamiętanego formatu.
    rememberPosterFormat("");
    expect(posterUrl(media)).toBe(media.posterWebp);
  });
});

describe("tło szkła", () => {
  it("rozkłada glassTint na kolor i krycie (przenikane osobno)", () => {
    expect(glassFill("rgba(14, 16, 20, 0.46)")).toEqual({ rgb: "14 16 20", alpha: 0.46 });
    expect(glassFill("rgba(12, 14, 18, 0.44)")).toEqual({ rgb: "12 14 18", alpha: 0.44 });
    expect(glassFill("rgb(8 10 14 / 0.3)")).toEqual({ rgb: "8 10 14", alpha: 0.3 });
    for (const scene of Object.values(SCENES)) expect(glassFill(scene.tokens.glassTint).alpha).toBeGreaterThan(0.3);
  });
});

describe("formatery dat", () => {
  it("ta sama instancja dla tej samej strefy i opcji, inna dla innej strefy", () => {
    const options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
    expect(formatter("Europe/Warsaw", options)).toBe(formatter("Europe/Warsaw", { ...options }));
    expect(formatter("Europe/Warsaw", options)).not.toBe(formatter("America/New_York", options));
    const at = new Date("2026-10-06T12:05:00Z");
    expect(formatTime(at, "Europe/Warsaw")).toBe("14:05");
    expect(formatTime(at, "America/New_York")).toBe("08:05");
  });
});
