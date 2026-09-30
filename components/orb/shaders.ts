/**
 * Shadery kuli „Obok” (GLSL ES 3.00). Jeden prostokąt na płótno kuli; każdy piksel
 * liczy refrakcję sceny przez sferę analitycznie (bez siatki i bez dodatkowych przebiegów).
 *
 * Układ współrzędnych: piksele CSS płótna, (0,0) w lewym górnym rogu. Piksel ekranu =
 * `uOrigin` + punkt płótna; współrzędne klatki sceny liczone przez to samo pudełko co wideo
 * (`uFit`, lib/scene-fit.ts), więc obraz w kuli leży dokładnie na tle.
 */

/** Trójkąt pokrywający cały ekran, bez buforów wierzchołków. */
export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform float uCanvas;      // bok płótna (px CSS)
uniform float uScale;       // piksele bufora na piksel CSS
uniform vec2 uOrigin;       // lewy górny róg płótna na ekranie (px CSS, z parallaxem)
uniform vec4 uFit;          // pudełko kadru sceny: left, top, width, height (px CSS)
uniform vec3 uBig;          // duża kula: środek (px płótna), promień
uniform vec3 uSmall;        // mała kula
uniform vec2 uCursor;       // kursor względem środka ekranu, [-1, 1]
uniform float uTime;        // czas animacji (s), zamrożony przy reduced motion
uniform float uThink;       // fale „myśli”, 0–1
uniform float uSpeak;       // światło „mówi”, 0–1
uniform float uFlash;       // błysk pioruna, 0–1

uniform sampler2D uScene0;  // warstwa bazowa sceny
uniform sampler2D uScene1;  // warstwa wchodząca (przenikanie)
uniform float uSceneMix;    // krycie warstwy wchodzącej, ten sam postęp co tło
uniform float uBrightness;  // grading tła (z błyskiem)
uniform mat3 uSaturate;     // macierz saturate() z lib/scene-grading.ts

uniform sampler2D uPreview0;
uniform sampler2D uPreview1;
uniform float uPreviewMix;   // 0 = scena, 1 = podgląd dnia
uniform float uPreviewBlend; // 0 = slot 0, 1 = slot 1
uniform vec2 uPreviewBrightness;
uniform mat3 uPreviewSaturate0;
uniform mat3 uPreviewSaturate1;
uniform vec3 uPreviewFocus;  // kadr podglądu: środek (0–1) i połowa wysokości
uniform float uAspect;       // proporcje klatki sceny

out vec4 outColor;

const vec3 AMBER = vec3(0.961, 0.627, 0.290);
const vec3 SMOKE = vec3(0.094, 0.118, 0.141);

// Kolejność jak w CSS: brightness(), potem saturate(); każdy krok przycięty jak w filtrach SVG.
vec3 grade(vec3 c, float brightness, mat3 saturateMatrix) {
  c = clamp(c * brightness, 0.0, 1.0);
  return clamp(saturateMatrix * c, 0.0, 1.0);
}

vec3 sceneAt(vec2 canvasPoint) {
  vec2 uv = clamp((uOrigin + canvasPoint - uFit.xy) / uFit.zw, 0.0, 1.0);
  vec3 c = texture(uScene0, uv).rgb;
  if (uSceneMix > 0.0) c = mix(c, texture(uScene1, uv).rgb, uSceneMix);
  return c;
}

// Kierunek soczewki (w promieniach kuli) → punkt kadru podglądu.
vec3 previewAt(vec2 dir) {
  vec2 uv = clamp(uPreviewFocus.xy + dir * vec2(uPreviewFocus.z / uAspect, uPreviewFocus.z), 0.0, 1.0);
  vec3 a = grade(texture(uPreview0, uv).rgb, uPreviewBrightness.x, uPreviewSaturate0);
  if (uPreviewBlend <= 0.0) return a;
  vec3 b = grade(texture(uPreview1, uv).rgb, uPreviewBrightness.y, uPreviewSaturate1);
  return mix(a, b, uPreviewBlend);
}

// Jedna szklana kula; wynik z przemnożoną alfą.
vec4 glassOrb(vec2 p, vec3 orb, float lensStrength, float think, float glow, float preview) {
  vec2 d = (p - orb.xy) / orb.z;
  float r = length(d);
  float aa = 1.5 / (orb.z * uScale);
  if (r > 1.0 + aa) return vec4(0.0);

  float z = sqrt(max(0.0, 1.0 - r * r));
  float edge = 1.0 - z;

  // Soczewka: środek powiększa (próbka bliżej środka), brzeg ściska i zagina otoczenie.
  float m = mix(1.0, mix(0.56, 1.34, pow(r, 2.2)), lensStrength);
  // Fale „myśli”: koncentryczne, biegną od środka i gasną przy brzegu.
  m += think * 0.05 * sin(r * 26.0 - uTime * 3.4) * (1.0 - r);
  // Refrakcja podąża za kursorem: najmocniej w środku, gdzie szkło jest najgrubsze.
  vec2 dir = d * m - uCursor * 0.14 * z * lensStrength;
  // Lekka aberracja chromatyczna, rosnąca ku brzegowi.
  float ca = 0.02 * r * r * lensStrength;
  vec2 dirR = dir * (1.0 + ca);
  vec2 dirB = dir * (1.0 - ca);

  vec3 col = vec3(
    sceneAt(orb.xy + dirR * orb.z).r,
    sceneAt(orb.xy + dir * orb.z).g,
    sceneAt(orb.xy + dirB * orb.z).b
  );
  col = grade(col, uBrightness, uSaturate);

  if (preview > 0.0) {
    vec3 inside = vec3(previewAt(dirR).r, previewAt(dir).g, previewAt(dirB).b);
    col = mix(col, inside, preview);
  }

  // Dymne szkło: odrobina tintu i światła, jak backdrop-filter w wersji CSS.
  col = mix(col, SMOKE, 0.06) * 1.06;

  float lit = 1.0 + uFlash * 1.6;
  // Fresnel: jaśniejszy brzeg.
  col += pow(edge, 3.0) * 0.2 * lit;
  // Refleks światła, lekko podąża za kursorem.
  vec2 spot = vec2(-0.32, -0.52) + uCursor * 0.1;
  col += exp(-dot(d - spot, d - spot) * 14.0) * 0.28 * lit;
  // Bursztynowy rim light po prawej (kolor lampy latarni).
  float side = smoothstep(-0.15, 0.95, d.x / max(r, 1e-3));
  col += AMBER * smoothstep(0.84, 1.0, r) * side * 0.7;
  // Delikatna poświata dolnego lewego brzegu (światło odbite od sceny).
  col += smoothstep(0.7, 1.0, r) * max(0.0, -d.x - d.y) * 0.08;
  // Światło „mówi”: bursztyn w głębi kuli.
  vec2 g = d - vec2(0.12, 0.18);
  col += AMBER * glow * exp(-dot(g, g) * 2.6) * 0.42 * z;
  // Włosowa krawędź szkła.
  col += 0.2 * (1.0 - smoothstep(0.0, 1.5 * aa, abs(r - (1.0 - aa))));

  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  return vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uCanvas * uScale - gl_FragCoord.y) / uScale;
  vec4 big = glassOrb(p, uBig, 1.0, uThink, uSpeak, uPreviewMix);
  vec4 small = glassOrb(p, uSmall, 0.8, 0.0, uSpeak * 1.4, 0.0);
  outColor = small + big * (1.0 - small.a);
}
`;
