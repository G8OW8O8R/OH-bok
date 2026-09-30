/**
 * Shadery kuli „Obok” (GLSL ES 3.00). Jeden prostokąt na płótno kuli; każdy piksel
 * liczy obraz w kuli analitycznie (bez siatki i bez dodatkowych przebiegów).
 *
 * Układ współrzędnych: piksele CSS płótna, (0,0) w lewym górnym rogu. Piksel ekranu =
 * `uOrigin` + punkt płótna; współrzędne klatki sceny liczone przez to samo pudełko co wideo
 * (`uFit`, lib/scene-fit.ts), więc obraz w kuli pochodzi z tych samych klatek co tło.
 */

/**
 * Optyka i szkło kuli – stałe do strojenia (wartości wpisywane do shadera przy kompilacji).
 *
 * Duża kula działa jak szerokokątny obiektyw (jak na makiecie): pokazuje szeroki,
 * pomniejszony wycinek sceny wokół siebie, przesunięty w stronę latarni, obraz prosty,
 * ściśnięty przy krawędzi. Mała kula zostaje zwykłą lekką soczewką.
 */
export const ORB_OPTICS = {
  /** Środek widoku względem środka kuli, w ułamkach klatki sceny (x: szerokości, y: wysokości). */
  viewShiftX: 0.33,
  viewShiftY: 0.16,
  /** Zasięg widoku na krawędzi kuli, w wysokościach klatki (0.48 = prawie cała wysokość klatki ≈ 80° pola widzenia). */
  viewSpan: 0.48,
  /** Udział liniowej części profilu: mniejszy = mocniejsze pomniejszenie w środku. */
  centerScale: 0.55,
  /** Wykładnik ściśnięcia przy krawędzi (większy = ostrzejsze zagięcie brzegu). */
  edgePower: 3,
  /** Przesunięcie widoku za kursorem (wysokości klatki przy kursorze na krawędzi ekranu). */
  cursorShift: 0.04,
  /** Aberracja chromatyczna na krawędzi (ułamek zasięgu). */
  chromatic: 0.012,

  /** Dymny tint szkła i rozjaśnienie ciemnych partii obrazu. */
  glassTint: 0.06,
  darkLift: 0.06,
  /** Fresnel: od jakiego promienia zaczyna się biała poświata i jej siła. */
  fresnelStart: 0.8,
  fresnel: 0.22,
  /** Refleks światła (plama u góry po lewej). */
  highlight: 0.2,
  /** Jak mocno jasny obraz tłumi poświatę i refleks (0 = wcale, 1 = całkiem przy bieli). */
  brightDamp: 0.75,
  /** Bursztynowy rim light po prawej. */
  rim: 0.7,
} as const;

/** Liczba zmiennoprzecinkowa zapisana dla GLSL (zawsze z kropką). */
function f(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

const O = ORB_OPTICS;

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

out vec4 outColor;

const vec3 AMBER = vec3(0.961, 0.627, 0.290);
const vec3 SMOKE = vec3(0.094, 0.118, 0.141);
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

const vec2 VIEW_SHIFT = vec2(${f(O.viewShiftX)}, ${f(O.viewShiftY)});
const float VIEW_SPAN = ${f(O.viewSpan)};
const float CENTER_SCALE = ${f(O.centerScale)};
const float EDGE_POWER = ${f(O.edgePower)};
const float CURSOR_SHIFT = ${f(O.cursorShift)};
const float CHROMATIC = ${f(O.chromatic)};
const float GLASS_TINT = ${f(O.glassTint)};
const float DARK_LIFT = ${f(O.darkLift)};
const float FRESNEL_START = ${f(O.fresnelStart)};
const float FRESNEL = ${f(O.fresnel)};
const float HIGHLIGHT = ${f(O.highlight)};
const float BRIGHT_DAMP = ${f(O.brightDamp)};
const float RIM = ${f(O.rim)};

// Kolejność jak w CSS: brightness(), potem saturate(); każdy krok przycięty jak w filtrach SVG.
vec3 grade(vec3 c, float brightness, mat3 saturateMatrix) {
  c = clamp(c * brightness, 0.0, 1.0);
  return clamp(saturateMatrix * c, 0.0, 1.0);
}

vec2 frameUv(vec2 screen) {
  return clamp((screen - uFit.xy) / uFit.zw, 0.0, 1.0);
}

vec3 sceneAt(vec2 screen) {
  vec2 uv = frameUv(screen);
  vec3 c = texture(uScene0, uv).rgb;
  if (uSceneMix > 0.0) c = mix(c, texture(uScene1, uv).rgb, uSceneMix);
  return grade(c, uBrightness, uSaturate);
}

// Podgląd dnia: ten sam kadr co scena (postery mają geometrię wideo), inna pogoda.
vec3 previewAt(vec2 screen) {
  vec2 uv = frameUv(screen);
  vec3 a = grade(texture(uPreview0, uv).rgb, uPreviewBrightness.x, uPreviewSaturate0);
  if (uPreviewBlend <= 0.0) return a;
  vec3 b = grade(texture(uPreview1, uv).rgb, uPreviewBrightness.y, uPreviewSaturate1);
  return mix(a, b, uPreviewBlend);
}

vec3 sample3(vec2 r, vec2 g, vec2 b, float preview) {
  vec3 c = vec3(sceneAt(r).r, sceneAt(g).g, sceneAt(b).b);
  if (preview > 0.0) c = mix(c, vec3(previewAt(r).r, previewAt(g).g, previewAt(b).b), preview);
  return c;
}

// Szkło wspólne dla obu kul: tint, poświata tłumiona w jasnych partiach, refleks, rim, krawędź.
vec3 glass(vec3 col, vec2 d, float r, float z, float aa, float glow) {
  float luma = dot(col, LUMA);
  float damp = 1.0 - BRIGHT_DAMP * luma;
  float lit = 1.0 + uFlash * 1.6;

  col = mix(col, SMOKE, GLASS_TINT) * (1.0 + DARK_LIFT * (1.0 - luma));
  // Fresnel tylko przy samej krawędzi, słabszy na jasnym obrazie (bez mleczności w środku).
  col += smoothstep(FRESNEL_START, 1.0, r) * pow(1.0 - z, 1.5) * FRESNEL * damp * lit;
  vec2 spot = vec2(-0.34, -0.55) + uCursor * 0.1;
  col += exp(-dot(d - spot, d - spot) * 18.0) * HIGHLIGHT * damp * lit;
  float side = smoothstep(-0.15, 0.95, d.x / max(r, 1e-3));
  col += AMBER * smoothstep(0.86, 1.0, r) * side * RIM;
  vec2 g = d - vec2(0.12, 0.18);
  col += AMBER * glow * exp(-dot(g, g) * 2.6) * 0.42 * z;
  col += 0.2 * (1.0 - smoothstep(0.0, 1.5 * aa, abs(r - (1.0 - aa))));
  return col;
}

// Duża kula: szerokokątny widok sceny (prosty, pomniejszony, ściśnięty przy krawędzi).
vec4 bigOrb(vec2 p, vec3 orb) {
  vec2 d = (p - orb.xy) / orb.z;
  float r = length(d);
  float aa = 1.5 / (orb.z * uScale);
  if (r > 1.0 + aa) return vec4(0.0);
  float z = sqrt(max(0.0, 1.0 - r * r));
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);

  // Profil: liniowy w środku, stromy przy krawędzi (ściśnięcie); fale „myśli” go falują.
  float rr = min(r, 1.0);
  float s = VIEW_SPAN * (CENTER_SCALE * rr + (1.0 - CENTER_SCALE) * pow(rr, EDGE_POWER));
  s += uThink * 0.02 * sin(r * 26.0 - uTime * 3.4) * (1.0 - r);

  vec2 center = uOrigin + orb.xy + VIEW_SHIFT * uFit.zw - uCursor * CURSOR_SHIFT * uFit.w;
  vec2 offset = dir * s * uFit.w;
  float ca = CHROMATIC * rr * rr;
  vec3 col = sample3(center + offset * (1.0 + ca), center + offset, center + offset * (1.0 - ca), uPreviewMix);

  col = glass(col, d, r, z, aa, uSpeak);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  return vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}

// Mała kula: lekka soczewka nad tym, co jest bezpośrednio za nią.
vec4 smallOrb(vec2 p, vec3 orb) {
  vec2 d = (p - orb.xy) / orb.z;
  float r = length(d);
  float aa = 1.5 / (orb.z * uScale);
  if (r > 1.0 + aa) return vec4(0.0);
  float z = sqrt(max(0.0, 1.0 - r * r));

  float m = mix(1.0, mix(0.56, 1.34, pow(r, 2.2)), 0.8);
  vec2 dir = d * m - uCursor * 0.11 * z;
  float ca = 0.016 * r * r;
  vec2 screen = uOrigin + orb.xy;
  vec3 col = sample3(screen + dir * (1.0 + ca) * orb.z, screen + dir * orb.z, screen + dir * (1.0 - ca) * orb.z, 0.0);

  col = glass(col, d, r, z, aa, uSpeak * 1.4);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  return vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uCanvas * uScale - gl_FragCoord.y) / uScale;
  vec4 big = bigOrb(p, uBig);
  vec4 small = smallOrb(p, uSmall);
  outColor = small + big * (1.0 - small.a);
}
`;
