import { describe, expect, it } from "vitest";
import { handoffStep, isFirstFrame, MAX_REWINDS, SCENE_FPS } from "@/lib/video-handoff";

const FRAME = 1 / SCENE_FPS;

describe("isFirstFrame", () => {
  it.each([0, 0.000243, FRAME * 0.49])("%f to klatka 0", (t) => {
    expect(isFirstFrame(t)).toBe(true);
  });

  it.each([FRAME * 0.5, FRAME, 0.135, -0.01])("%f to nie klatka 0", (t) => {
    expect(isFirstFrame(t)).toBe(false);
  });
});

describe("handoffStep", () => {
  it("klatka 0 = odsłoń wideo", () => {
    expect(handoffStep(0, 0)).toBe("reveal");
  });

  it("późniejsza klatka = cofnij do 0", () => {
    expect(handoffStep(FRAME * 3, 0)).toBe("rewind");
  });

  it("po limicie cofnięć odsłania mimo wszystko (scena nigdy nie utyka)", () => {
    expect(handoffStep(FRAME * 3, MAX_REWINDS)).toBe("reveal");
  });
});
