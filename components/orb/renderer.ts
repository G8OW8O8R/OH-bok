import type { Circle, Point } from "@/lib/orb/geometry";
import type { SceneFit } from "@/lib/scene-fit";
import { saturateMatrix } from "@/lib/scene-grading";
import type { VideoFilter } from "@/lib/scenes";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";

/** Tekstury: dwie warstwy sceny (przenikanie) i dwa sloty podglądu dnia. */
export type TextureSlot = "scene0" | "scene1" | "preview0" | "preview1";
const SLOTS: readonly TextureSlot[] = ["scene0", "scene1", "preview0", "preview1"];

export type TextureSource = HTMLVideoElement | HTMLImageElement;

export interface OrbFrame {
  canvas: number;
  scale: number;
  origin: Point;
  fit: SceneFit;
  big: Circle;
  small: Circle;
  cursor: Point;
  time: number;
  think: number;
  speak: number;
  flash: number;
  /** Krople deszczu na szkle, 0–1. */
  rain: number;
  /** Tekstury warstw sceny od spodu; druga tylko w trakcie przenikania. */
  scene: readonly [TextureSlot, TextureSlot | null];
  sceneMix: number;
  brightness: number;
  saturate: number;
  previewMix: number;
  previewBlend: number;
  previewGrading: readonly [VideoFilter, VideoFilter];
}

const UNIFORMS = [
  "uCanvas",
  "uScale",
  "uOrigin",
  "uFit",
  "uBig",
  "uSmall",
  "uCursor",
  "uTime",
  "uThink",
  "uSpeak",
  "uFlash",
  "uRain",
  "uScene0",
  "uScene1",
  "uSceneMix",
  "uBrightness",
  "uSaturate",
  "uPreview0",
  "uPreview1",
  "uPreviewMix",
  "uPreviewBlend",
  "uPreviewBrightness",
  "uPreviewSaturate0",
  "uPreviewSaturate1",
] as const;

type UniformName = (typeof UNIFORMS)[number];

interface TextureState {
  texture: WebGLTexture;
  width: number;
  height: number;
}

function sourceSize(source: TextureSource): { width: number; height: number } {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.naturalWidth, height: source.naturalHeight };
}

function compile(gl: WebGL2RenderingContext, type: number, code: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, code);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn("Kula: shader się nie skompilował.", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Renderer kuli na WebGL2: jeden program, cztery tekstury, jedno wywołanie rysowania na klatkę.
 * Pętla, pomiary i decyzje o przesyłaniu klatek są w OrbCanvas.tsx.
 */
export class OrbRenderer {
  private readonly textures: Record<TextureSlot, TextureState>;
  private disposed = false;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly program: WebGLProgram,
    private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>,
  ) {
    const textures = {} as Record<TextureSlot, TextureState>;
    SLOTS.forEach((slot, unit) => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // 1×1 czerń, dopóki nie przyjdzie pierwsza klatka.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      textures[slot] = { texture, width: 0, height: 0 };
    });
    this.textures = textures;
    gl.useProgram(program);
    gl.uniform1i(uniforms.uPreview0, SLOTS.indexOf("preview0"));
    gl.uniform1i(uniforms.uPreview1, SLOTS.indexOf("preview1"));
    gl.clearColor(0, 0, 0, 0);
  }

  /**
   * Tworzy renderer albo zwraca null (brak WebGL2, renderowanie programowe, błąd shadera).
   * `allowSoftware` tylko przy wymuszonym `?orb-mode=webgl` (np. testy w headless Chrome).
   */
  static create(canvas: HTMLCanvasElement, { allowSoftware }: { allowSoftware: boolean }): OrbRenderer | null {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: !allowSoftware,
    });
    if (!gl || gl.isContextLost()) return null;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Kula: program WebGL się nie zlinkował.", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    const uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;
    return new OrbRenderer(gl, program, uniforms);
  }

  resize(width: number, height: number): void {
    const canvas = this.gl.canvas;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /** Przesyła klatkę (wideo) lub obraz do tekstury. Zwraca false, gdy źródło nie ma jeszcze danych. */
  upload(slot: TextureSlot, source: TextureSource): boolean {
    if (this.disposed) return false;
    const { width, height } = sourceSize(source);
    if (width === 0 || height === 0) return false;
    const gl = this.gl;
    const state = this.textures[slot];
    gl.activeTexture(gl.TEXTURE0 + SLOTS.indexOf(slot));
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    if (state.width === width && state.height === height) {
      // Ten sam rozmiar: bez ponownej alokacji pamięci (typowo: kolejna klatka wideo).
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      state.width = width;
      state.height = height;
    }
    return true;
  }

  draw(frame: OrbFrame): void {
    if (this.disposed) return;
    const gl = this.gl;
    const u = this.uniforms;
    gl.useProgram(this.program);

    gl.uniform1f(u.uCanvas, frame.canvas);
    gl.uniform1f(u.uScale, frame.scale);
    gl.uniform2f(u.uOrigin, frame.origin.x, frame.origin.y);
    gl.uniform4f(u.uFit, frame.fit.left, frame.fit.top, frame.fit.width, frame.fit.height);
    gl.uniform3f(u.uBig, frame.big.x, frame.big.y, frame.big.r);
    gl.uniform3f(u.uSmall, frame.small.x, frame.small.y, frame.small.r);
    gl.uniform2f(u.uCursor, frame.cursor.x, frame.cursor.y);
    gl.uniform1f(u.uTime, frame.time);
    gl.uniform1f(u.uThink, frame.think);
    gl.uniform1f(u.uSpeak, frame.speak);
    gl.uniform1f(u.uFlash, frame.flash);
    gl.uniform1f(u.uRain, frame.rain);

    const [base, incoming] = frame.scene;
    gl.uniform1i(u.uScene0, SLOTS.indexOf(base));
    gl.uniform1i(u.uScene1, SLOTS.indexOf(incoming ?? base));
    gl.uniform1f(u.uSceneMix, incoming ? frame.sceneMix : 0);
    gl.uniform1f(u.uBrightness, frame.brightness);
    gl.uniformMatrix3fv(u.uSaturate, false, saturateMatrix(frame.saturate));

    gl.uniform1f(u.uPreviewMix, frame.previewMix);
    gl.uniform1f(u.uPreviewBlend, frame.previewBlend);
    const [first, second] = frame.previewGrading;
    gl.uniform2f(u.uPreviewBrightness, first.brightness, second.brightness);
    gl.uniformMatrix3fv(u.uPreviewSaturate0, false, saturateMatrix(first.saturate));
    gl.uniformMatrix3fv(u.uPreviewSaturate1, false, saturateMatrix(second.saturate));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Zwalnia zasoby GPU. Kontekstu nie niszczymy: przy StrictMode to samo płótno dostaje go ponownie. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    for (const slot of SLOTS) gl.deleteTexture(this.textures[slot].texture);
    gl.deleteProgram(this.program);
  }
}
