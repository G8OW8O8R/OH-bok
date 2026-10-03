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

  /** Krople na szkle: przesunięcie obrazu w kropli (wysokości klatki), cień brzegu, refleks. */
  dropLens: 0.05,
  dropShade: 0.22,
  dropSpecular: 0.3,
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
uniform float uRain;        // krople na szkle, 0–1 (siła z mm/h, lib/scene-conditions.ts)

uniform sampler2D uScene0;  // warstwa bazowa sceny
uniform sampler2D uScene1;  // warstwa wchodząca (przenikanie)
uniform float uSceneMix;    // krycie warstwy wchodzącej, ten sam postęp co tło
uniform float uBrightness;  // grading tła (z błyskiem)
uniform mat3 uSaturate;     // macierz koloru: saturate() · barwa sceny (colorMatrix, lib/scene-grading.ts)

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
const float DROP_LENS = ${f(O.dropLens)};
const float DROP_SHADE = ${f(O.dropShade)};
const float DROP_SPECULAR = ${f(O.dropSpecular)};

// Kolejność jak w CSS: brightness(), potem saturate(); każdy krok przycięty jak w filtrach SVG.
vec3 grade(vec3 c, float brightness, mat3 saturateMatrix) {
  c = clamp(c * brightness, 0.0, 1.0);
  return clamp(saturateMatrix * c, 0.0, 1.0);
}

// Poza kadrem odbicie lustrzane zamiast przycięcia: szerokokątny wycinek kuli stojącej wysoko
// (telefon) sięga ponad górną krawędź kadru, a powielony skrajny wiersz dawał poziome smugi.
vec2 frameUv(vec2 screen) {
  vec2 uv = (screen - uFit.xy) / uFit.zw;
  vec2 m = mod(uv, 2.0);
  return mix(m, 2.0 - m, step(1.0, m));
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

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Jedna kropla; v = punkt względem środka kropli w jej promieniach.
// acc: xy = soczewka (odwrócony obraz, stąd minus), z = krycie kropli, w = refleks.
void addDrop(inout vec4 acc, vec2 v, float alpha) {
  float m = 1.0 - dot(v, v);
  if (m <= 0.0 || alpha <= 0.0) return;
  float edge = smoothstep(0.0, 0.25, m) * alpha;
  acc.xy -= v * edge;
  acc.z = max(acc.z, edge);
  vec2 s = v - vec2(-0.35, -0.4);
  acc.w += exp(-dot(s, s) * 14.0) * edge;
}

// Krople deszczu na powierzchni (d: punkt kuli w jej promieniach, y w dół).
// Statyczna „tekstura” kropli z siatki komórek + kilka kropli powoli spływających ze śladem.
vec4 rainDrops(vec2 d, float t, float amount) {
  vec4 acc = vec4(0.0);
  if (amount <= 0.0) return acc;

  vec2 g = d * 5.0;
  vec2 id = floor(g);
  vec2 f = g - id - 0.5;
  float present = step(hash12(id), mix(0.18, 0.62, amount));
  vec2 c = (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.45;
  float r = mix(0.1, 0.24, hash12(id + 5.3));
  addDrop(acc, (f - c) / r, present);

  const float COLS = 8.0;
  float col = floor((d.x + 1.0) * 0.5 * COLS);
  if (hash11(col + 1.3) < 0.2 + 0.6 * amount) {
    float speed = mix(0.05, 0.11, hash11(col + 2.9));
    float y = fract(t * speed + hash11(col + 4.4)) * 2.8 - 1.4;
    float x = (col + 0.5 + (hash11(col + 6.2) - 0.5) * 0.4) / COLS * 2.0 - 1.0 + sin(d.y * 7.0 + col) * 0.015;
    float rd = mix(0.045, 0.065, hash11(col + 8.1));
    addDrop(acc, vec2(d.x - x, (d.y - y) * 0.85) / rd, 1.0);
    // Ślad: drobne kropelki nad spływającą kroplą, znikające z odległością.
    float above = y - d.y;
    if (above > rd && above < 0.45) {
      float cell = floor(d.y * 22.0);
      float fy = (fract(d.y * 22.0) - 0.5) / 22.0;
      float tiny = rd * 0.32;
      float keep = step(hash11(cell + col * 13.0), 0.55) * (1.0 - above / 0.45);
      addDrop(acc, vec2(d.x - x, fy) / tiny, keep);
    }
  }
  return acc * min(1.0, amount * 2.0 + 0.4);
}

// Cień brzegu i refleks kropli na gotowym kolorze.
vec3 shadeDrops(vec3 col, vec4 drops) {
  col *= 1.0 - DROP_SHADE * 4.0 * drops.z * (1.0 - drops.z);
  return col + DROP_SPECULAR * drops.w * (1.0 - 0.6 * dot(col, LUMA));
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
  // Cały widok (promień VIEW_SPAN wysokości klatki) zostaje w kadrze w poziomie. Na desktopie
  // środek i tak w nim leży; na telefonie kadr jest szeroki (pionowy ekran), a przesunięcie
  // o VIEW_SHIFT wyprowadzało widok poza prawą krawędź i latarnia odbijała się lustrzanie.
  float margin = VIEW_SPAN * uFit.w;
  center.x = clamp(center.x, uFit.x + margin, uFit.x + uFit.z - margin);
  vec4 drops = rainDrops(d, uTime, uRain);
  vec2 offset = dir * s * uFit.w;
  float ca = CHROMATIC * rr * rr;
  vec2 lens = drops.xy * DROP_LENS * uFit.w;
  vec3 col = sample3(center + offset * (1.0 + ca) + lens, center + offset + lens, center + offset * (1.0 - ca) + lens, uPreviewMix);

  col = shadeDrops(glass(col, d, r, z, aa, uSpeak), drops);
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
  // Krople w tej samej skali co na dużej kuli (mała ma ok. 0,21 jej promienia), inny wzór.
  vec4 drops = rainDrops(d * 0.21 + vec2(3.7, 1.3), uTime, uRain);
  vec2 dir = d * m - uCursor * 0.11 * z + drops.xy * 0.35;
  float ca = 0.016 * r * r;
  vec2 screen = uOrigin + orb.xy;
  vec3 col = sample3(screen + dir * (1.0 + ca) * orb.z, screen + dir * orb.z, screen + dir * (1.0 - ca) * orb.z, 0.0);

  col = shadeDrops(glass(col, d, r, z, aa, uSpeak * 1.4), drops);
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
