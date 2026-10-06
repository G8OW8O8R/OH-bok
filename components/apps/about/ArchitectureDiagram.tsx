import { useId } from "react";
import { ARCHITECTURE_DESCRIPTION, ARCHITECTURE_ROUTES } from "@/lib/about";

const TEXT = "rgb(255 255 255 / 0.96)";
const TEXT_SOFT = "rgb(255 255 255 / 0.78)";
const LINE = "rgb(255 255 255 / 0.5)";
const BOX = { fill: "rgb(255 255 255 / 0.06)", stroke: "rgb(255 255 255 / 0.18)" };
const AMBER = "var(--color-amber)";

/**
 * Schemat architektury (okno „O systemie”): przeglądarka → trasy API Next.js (cache, fallbacki) →
 * źródła danych, plus WebSocket Binance prosto z przeglądarki. Dwa układy: poziomy (okno) i pionowy
 * (arkusz na telefonie). Czytnik dostaje opis tekstowy (`<desc>`).
 */
export function ArchitectureDiagram() {
  const id = useId();
  return (
    <figure className="m-0">
      <WideDiagram id={`${id}-wide`} />
      <TallDiagram id={`${id}-tall`} />
    </figure>
  );
}

function Markers({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0.5 L7.5 4 L0 7.5 Z" fill={LINE} />
      </marker>
      <marker id={`${id}-live`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0.5 L7.5 4 L0 7.5 Z" fill={AMBER} />
      </marker>
    </defs>
  );
}

function Label({ id }: { id: string }) {
  return (
    <>
      <title id={`${id}-title`}>Schemat architektury</title>
      <desc id={`${id}-desc`}>{ARCHITECTURE_DESCRIPTION}</desc>
    </>
  );
}

const ROW = 28;

function WideDiagram({ id }: { id: string }) {
  const browser = { x: 0, y: 84, w: 108, h: 76 };
  const server = { x: 142, y: 4, w: 162, h: 230 };
  const source = { x: 338, w: 194 };
  const rowY = (index: number) => 54 + index * ROW;
  const live = source.x + source.w / 2;
  return (
    <svg
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      viewBox="0 -26 532 262"
      className="architecture hidden h-auto w-full sm:block"
      data-testid="architecture-diagram"
    >
      <Label id={id} />
      <Markers id={id} />
      {/* Przeglądarka */}
      <rect x={browser.x + 0.5} y={browser.y} width={browser.w} height={browser.h} rx={14} {...BOX} />
      <text x={browser.w / 2} y={116} textAnchor="middle" fontSize={14} fontWeight={600} fill={TEXT}>
        Przeglądarka
      </text>
      <text x={browser.w / 2} y={134} textAnchor="middle" fontSize={12} fill={TEXT_SOFT}>
        pulpit · okna
      </text>
      <text x={browser.w / 2} y={149} textAnchor="middle" fontSize={12} fill={TEXT_SOFT}>
        Zustand · Zod
      </text>
      <line
        x1={browser.w + 3}
        y1={122}
        x2={server.x - 3}
        y2={122}
        stroke={LINE}
        strokeWidth={1.25}
        markerStart={`url(#${id}-arrow)`}
        markerEnd={`url(#${id}-arrow)`}
      />

      {/* Trasy API */}
      <rect x={server.x} y={server.y} width={server.w} height={server.h} rx={16} {...BOX} />
      <text x={server.x + 14} y={30} fontSize={14} fontWeight={600} fill={TEXT}>
        Next.js · trasy API
      </text>
      {ARCHITECTURE_ROUTES.map(({ route, source: name }, index) => (
        <g key={route}>
          <text x={server.x + 14} y={rowY(index) + 4.5} fontSize={13} fill={TEXT}>
            {route}
          </text>
          <line
            x1={server.x + server.w}
            y1={rowY(index)}
            x2={source.x - 3}
            y2={rowY(index)}
            stroke={LINE}
            strokeWidth={1.25}
            markerEnd={`url(#${id}-arrow)`}
          />
          <rect x={source.x} y={rowY(index) - 12} width={source.w - 0.5} height={24} rx={12} {...BOX} />
          <text x={source.x + 12} y={rowY(index) + 4.5} fontSize={13} fill={TEXT}>
            {name}
          </text>
        </g>
      ))}
      <text x={server.x + 14} y={224} fontSize={12} fill={TEXT_SOFT}>
        cache → pamięć → demo
      </text>

      {/* WebSocket: ceny na żywo z Binance prosto do przeglądarki */}
      <path
        d={`M${browser.w / 2} ${browser.y - 2} V-6 Q${browser.w / 2} -16 ${browser.w / 2 + 10} -16 H${live - 10} Q${live} -16 ${live} -6 V${rowY(0) - 15}`}
        fill="none"
        stroke={AMBER}
        strokeWidth={1.25}
        strokeDasharray="4 4"
        markerEnd={`url(#${id}-live)`}
      />
      <text x={(browser.w / 2 + live) / 2} y={-2} textAnchor="middle" fontSize={12} fill={AMBER}>
        WebSocket · ceny na żywo
      </text>
    </svg>
  );
}

function TallDiagram({ id }: { id: string }) {
  const rowY = (index: number) => 132 + index * 30;
  const pill = { x: 150, w: 158 };
  return (
    <svg
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      viewBox="0 0 320 326"
      className="architecture h-auto w-full sm:hidden"
    >
      <Label id={id} />
      <Markers id={id} />
      <rect x={1} y={1} width={318} height={50} rx={14} {...BOX} />
      <text x={14} y={22} fontSize={13} fontWeight={600} fill={TEXT}>
        Przeglądarka
      </text>
      <text x={14} y={40} fontSize={11} fill={TEXT_SOFT}>
        pulpit · okna · Zustand · Zod
      </text>
      <line x1={80} y1={54} x2={80} y2={76} stroke={LINE} strokeWidth={1.25} markerStart={`url(#${id}-arrow)`} markerEnd={`url(#${id}-arrow)`} />

      <rect x={1} y={79} width={318} height={246} rx={16} {...BOX} />
      <text x={14} y={104} fontSize={13} fontWeight={600} fill={TEXT}>
        Next.js · trasy API
      </text>
      {ARCHITECTURE_ROUTES.map(({ route, source: name }, index) => (
        <g key={route}>
          <text x={14} y={rowY(index) + 4} fontSize={12} fill={TEXT}>
            {route}
          </text>
          <line x1={110} y1={rowY(index)} x2={pill.x - 3} y2={rowY(index)} stroke={LINE} strokeWidth={1.25} markerEnd={`url(#${id}-arrow)`} />
          <rect x={pill.x} y={rowY(index) - 12} width={pill.w} height={24} rx={12} {...BOX} />
          <text x={pill.x + 8} y={rowY(index) + 4} fontSize={11} fill={TEXT}>
            {name}
          </text>
        </g>
      ))}
      <text x={14} y={312} fontSize={11} fill={TEXT_SOFT}>
        cache → pamięć → demo
      </text>

      <path d={`M300 51 V${rowY(0) - 15}`} fill="none" stroke={AMBER} strokeWidth={1.25} strokeDasharray="4 4" markerEnd={`url(#${id}-live)`} />
      <text x={292} y={70} textAnchor="end" fontSize={11} fill={AMBER}>
        WebSocket
      </text>
    </svg>
  );
}
