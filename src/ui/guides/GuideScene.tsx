import { useId, type ReactNode } from 'react';

const ink = '#344d43',
  green = '#527762',
  light = '#dae5d8',
  orange = '#d87936';
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type Point = [number, number];
const points = (p: Point[]) => p.map((v) => v.join(',')).join(' ');
const lerp = (a: Point, b: Point, t: number): Point => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
function Dot({ p, active = true }: { p: Point; active?: boolean }) {
  return (
    <g>
      <circle
        cx={p[0]}
        cy={p[1]}
        r={active ? 7 : 5}
        fill="#fbfcf8"
        stroke={active ? orange : green}
        strokeWidth="2"
      />
      <circle cx={p[0]} cy={p[1]} r="2" fill={active ? orange : green} />
    </g>
  );
}
function Cursor({ p, click = false }: { p: Point; click?: boolean }) {
  return (
    <g transform={`translate(${p[0]} ${p[1]})`}>
      {click && <circle r="15" fill={orange} opacity=".18" stroke={orange} />}
      <path
        d="M0 0 3 23 9 17 15 27 20 24 14 15 23 12Z"
        fill="#fff"
        stroke={ink}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </g>
  );
}
function Label({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-59" y="-16" width="118" height="30" rx="7" fill="#fffefb" stroke="#d3ddd3" />
      <text textAnchor="middle" y="4" fontSize="13" fontWeight="600" fill={ink}>
        {children}
      </text>
    </g>
  );
}
function Box({
  x = 0,
  y = 0,
  h = 70,
  angle = 0,
  selected = false,
  opacity = 1,
  color = light,
}: {
  x?: number;
  y?: number;
  h?: number;
  angle?: number;
  selected?: boolean;
  opacity?: number;
  color?: string;
}) {
  const project = (a: number, b: number, z: number): Point => {
    const r = (angle * Math.PI) / 180,
      u = a * Math.cos(r) - b * Math.sin(r) + x,
      v = a * Math.sin(r) + b * Math.cos(r) + y;
    return [270 + (u - v) * 0.82, 207 + (u + v) * 0.33 - z];
  };
  const a = project(-85, -55, 0),
    b = project(85, -55, 0),
    c = project(85, 55, 0),
    d = project(-85, 55, 0),
    top = [-85, 85, 85, -85].map((xx, i) => project(xx, [-55, -55, 55, 55][i], h));
  return (
    <g
      opacity={opacity}
      stroke={selected ? orange : ink}
      strokeWidth={selected ? 2.4 : 1.3}
      strokeLinejoin="round"
    >
      <polygon points={points([d, c, top[2], top[3]])} fill="#aebfac" />
      <polygon points={points([b, c, top[2], top[1]])} fill="#c5d2bf" />
      <polygon points={points(top)} fill={color} />
      {h < 2 && <polygon points={points([a, b, c, d])} fill={color} />}
    </g>
  );
}
function Plan({ children }: { children?: ReactNode }) {
  return (
    <g>
      <rect
        x="110"
        y="85"
        width="340"
        height="165"
        rx="3"
        fill={light}
        stroke={ink}
        strokeWidth="1.5"
      />
      {children}
    </g>
  );
}
function Polyline({
  p,
  dash = false,
  color = orange,
  width = 2.5,
}: {
  p: Point[];
  dash?: boolean;
  color?: string;
  width?: number;
}) {
  return (
    <polyline
      points={points(p)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dash ? '7 5' : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** One small SVG is animated at a time. Coordinates are illustrative, never CAD data. */
export function GuideScene({
  topic,
  progress,
  title,
}: {
  topic: string;
  progress: number;
  title?: string;
}) {
  const id = useId().replaceAll(':', ''),
    draw = clamp((progress - 0.32) / 0.34),
    done = progress >= 0.68,
    stage = Math.min(2, Math.floor(progress * 3));
  let scene: ReactNode,
    cursor: Point = [180, 185];
  const click =
    progress < 0.07 || Math.abs(progress - 0.34) < 0.035 || Math.abs(progress - 0.7) < 0.04;
  if (['rectangle', 'circle', 'ellipse', 'polygon', 'sphere'].includes(topic)) {
    const size = done ? 1 : mix(0.02, 1, draw);
    const center: Point = [280, 162];
    cursor =
      topic === 'rectangle' ? lerp([145, 100], [420, 230], draw) : lerp(center, [400, 162], draw);
    scene = (
      <>
        {topic === 'rectangle' ? (
          <>
            <rect
              x="145"
              y="100"
              width={275 * size}
              height={130 * size}
              fill={light}
              fillOpacity={done ? 1 : 0.35}
              stroke={done ? green : orange}
              strokeWidth="2"
            />
            <Dot p={[145, 100]} />
            {draw > 0.25 && (
              <Label x={280} y={262}>
                600 × 400
              </Label>
            )}
          </>
        ) : (
          <>
            {topic === 'polygon' ? (
              <polygon
                points={points(
                  Array.from(
                    { length: 6 },
                    (_, i) =>
                      [
                        280 + 120 * size * Math.cos((i * Math.PI) / 3),
                        162 + 100 * size * Math.sin((i * Math.PI) / 3),
                      ] as Point,
                  ),
                )}
                fill={light}
                stroke={done ? green : orange}
                strokeWidth="2"
              />
            ) : (
              <ellipse
                cx="280"
                cy="162"
                rx={120 * size}
                ry={(topic === 'ellipse' ? 68 : 100) * size}
                fill={topic === 'sphere' ? `url(#${id}-ball)` : light}
                stroke={done ? green : orange}
                strokeWidth="2"
              />
            )}
            {topic === 'sphere' && size > 0.1 && (
              <ellipse
                cx="280"
                cy="162"
                rx={120 * size}
                ry={32 * size}
                fill="none"
                stroke={green}
                opacity=".4"
              />
            )}
            <Dot p={center} />
            <Polyline p={[center, cursor]} dash />
            {draw > 0.25 && (
              <Label x={280} y={284}>
                {topic === 'ellipse' ? '160 × 90' : topic === 'polygon' ? '6 sivua' : 'Ø 100 mm'}
              </Label>
            )}
          </>
        )}
      </>
    );
  } else if (topic === 'scale') {
    const factor = 1 + draw * 0.45;
    cursor = [270 + 115 * factor, 207 - 90 * factor];
    scene = (
      <>
        <Box opacity={0.18} />
        <g transform={`translate(270 207) scale(${factor}) translate(-270 -207)`}>
          <Box selected />
        </g>
        <Dot p={cursor} />
        <text x="280" y="305" fill={ink} fontSize="15">
          {factor.toFixed(2)} × · Tasainen
        </text>
      </>
    );
  } else if (['move', 'copy', 'rotate', 'extrude', 'navigate', 'capture'].includes(topic)) {
    const motion = draw;
    const dx = ['move', 'copy'].includes(topic) ? motion * 115 : 0;
    cursor =
      topic === 'rotate'
        ? [270 + 90 * Math.cos((motion * Math.PI) / 2), 210 - 75 * Math.sin((motion * Math.PI) / 2)]
        : topic === 'extrude'
          ? [280, 155 - 70 * motion]
          : [260 + dx * 0.82, 172 + dx * 0.33];
    scene = (
      <>
        {['move', 'copy'].includes(topic) && (
          <>
            <Box opacity={topic === 'copy' ? 0.45 : 0.12} />
            <Polyline
              p={[
                [160, 250],
                [455, 250],
              ]}
              dash
              color="#b7655c"
            />
            <text x="458" y="254" fill="#b7655c" fontSize="12">
              X
            </text>
          </>
        )}
        {topic === 'rotate' && (
          <ellipse cx="270" cy="207" rx="120" ry="55" fill="none" stroke={green} strokeWidth="3" />
        )}
        <Box
          x={dx}
          h={topic === 'extrude' ? 30 + 70 * motion : 70}
          angle={topic === 'rotate' ? 45 * motion : topic === 'navigate' ? 35 * motion : 0}
          selected={topic !== 'navigate' && topic !== 'capture'}
        />
        {topic === 'extrude' && (
          <>
            <Dot p={[280, 155]} />
            <Polyline
              p={[
                [280, 155],
                [280, 85],
              ]}
              dash
            />
            {draw > 0.1 && (
              <Label x={398} y={96}>
                {Math.round(40 * motion)} mm
              </Label>
            )}
          </>
        )}
        {topic === 'rotate' && (
          <>
            <Dot p={[270, 207]} />
            <Label x={395} y={100}>
              {Math.round(45 * motion)}°
            </Label>
          </>
        )}
        {['move', 'copy'].includes(topic) && draw > 0.1 && (
          <Label x={280} y={286}>
            {Math.round(150 * motion)} mm
          </Label>
        )}
        {topic === 'capture' && (
          <rect
            x="105"
            y="65"
            width="350"
            height="205"
            rx="8"
            fill="none"
            stroke={done ? green : orange}
            strokeWidth="2"
            strokeDasharray={done ? undefined : '8 7'}
          />
        )}
        {topic === 'capture' && done && (
          <Label x={280} y={286}>
            PNG tallennettu
          </Label>
        )}
      </>
    );
  } else if (['pen', 'free', 'bezier'].includes(topic)) {
    const p: Point[] = [
      [145, 210],
      [145, 110],
      [390, 110],
      [390, 210],
      [145, 210],
    ];
    const n = clamp((progress - 0.15) / 0.67) * (topic === 'free' ? 3 : 4),
      at = Math.min(3, Math.floor(n)),
      sub = n - at;
    const path = p.slice(0, at + 1);
    path.push(lerp(p[at], p[at + 1], sub));
    cursor = path.at(-1)!;
    scene =
      topic === 'bezier' ? (
        <>
          <path
            d="M140 225 C185 220 210 85 280 100 S365 230 430 170"
            fill="none"
            stroke={done ? green : orange}
            strokeWidth="3"
            pathLength="100"
            strokeDasharray={`${Math.max(1, progress * 140)} 140`}
          />
          {[
            [140, 225],
            [280, 100],
            [430, 170],
          ]
            .slice(0, stage + 1)
            .map((v, i) => (
              <Dot key={i} p={v as Point} />
            ))}
        </>
      ) : (
        <>
          {topic === 'pen' && done && <polygon points={points(p)} fill={light} opacity=".7" />}
          <Polyline p={path} color={done ? green : orange} />
          {path.slice(0, -1).map((v, i) => (
            <Dot key={i} p={v} />
          ))}
          {topic === 'free' && (
            <Label x={270} y={88}>
              245 mm
            </Label>
          )}
        </>
      );
    if (topic === 'bezier')
      cursor =
        stage === 0 ? [140, 225] : stage === 1 ? lerp([140, 225], [280, 100], draw) : [430, 170];
  } else if (
    ['offset', 'fillet', 'chamfer', 'erase', 'knife', 'opening', 'cut', 'join'].includes(topic)
  ) {
    cursor = lerp([310, 85], [350, 145], draw);
    if (topic === 'offset')
      scene = (
        <Plan>
          <rect
            x={110 + draw * 28}
            y={85 + draw * 28}
            width={340 - draw * 56}
            height={165 - draw * 56}
            fill="#f7f9f3"
            stroke={orange}
            strokeWidth="2.5"
          />
          {done && (
            <Label x={280} y={280}>
              18 mm inset
            </Label>
          )}
        </Plan>
      );
    else if (['fillet', 'chamfer'].includes(topic)) {
      const r = 45 * draw;
      scene = (
        <>
          <rect
            x="140"
            y="85"
            width="280"
            height="165"
            fill="none"
            stroke="#b4c2b6"
            strokeDasharray="5 5"
          />
          {topic === 'fillet' ? (
            <rect
              x="140"
              y="85"
              width="280"
              height="165"
              rx={r}
              fill={light}
              stroke={orange}
              strokeWidth="3"
            />
          ) : (
            <path
              d={`M${140 + r} 85 H${420 - r} L420 ${85 + r} V${250 - r} L${420 - r} 250 H${140 + r} L140 ${250 - r} V${85 + r}Z`}
              fill={light}
              stroke={orange}
              strokeWidth="3"
            />
          )}
          <Dot p={[140, 85]} />
          <Label x={280} y={284}>
            {topic === 'fillet' ? 'R 10 mm' : '3 mm'}
          </Label>
        </>
      );
    } else if (topic === 'erase')
      scene = (
        <Plan>
          <path d="M280 85 V250" stroke={orange} strokeWidth="3" opacity={1 - draw} />
          {done && (
            <Label x={280} y={284}>
              Yhtenäinen pinta
            </Label>
          )}
        </Plan>
      );
    else if (topic === 'knife') {
      cursor = lerp([95, 265], [465, 65], draw);
      scene = (
        <>
          <path
            d="M110 85H450L110 250Z"
            transform={done ? 'translate(-9 -6)' : undefined}
            fill={light}
            stroke={ink}
          />
          <path
            d="M450 85V250H110Z"
            transform={done ? 'translate(9 6)' : undefined}
            fill="#b8cbb4"
            stroke={ink}
          />
          <Polyline p={[[95, 265], cursor]} />
          {done && (
            <Label x={280} y={286}>
              2 erillistä osaa
            </Label>
          )}
        </>
      );
    } else if (topic === 'join') {
      cursor = lerp([190, 150], [365, 190], draw);
      scene = done ? (
        <path
          d="M120 95H325V140H435V260H250V210H120Z"
          fill={light}
          stroke={green}
          strokeWidth="2"
        />
      ) : (
        <>
          <rect
            x="120"
            y="95"
            width="205"
            height="115"
            fill={light}
            stroke={orange}
            strokeWidth="2"
          />
          <rect
            x="250"
            y="140"
            width="185"
            height="120"
            fill="#b6cbd0"
            fillOpacity=".75"
            stroke={stage ? orange : ink}
            strokeWidth="2"
          />
        </>
      );
    } else {
      cursor = lerp([280, 155], [350, 195], draw);
      scene = (
        <Plan>
          <circle
            cx="280"
            cy="167"
            r={topic === 'opening' ? 50 * mix(0.03, 1, draw) : 50}
            fill={done ? '#f5f7f0' : '#89aeb7'}
            fillOpacity={done ? 1 : 0.7}
            stroke={orange}
            strokeWidth="2"
          />
          {!done && topic === 'cut' && (
            <path
              d="M230 167V95 A50 18 0 0 1 330 95V167"
              fill="#abc5c9"
              fillOpacity=".65"
              stroke="#6a939e"
            />
          )}
          {done && (
            <Label x={280} y={283}>
              Aukko läpi
            </Label>
          )}
        </Plan>
      );
    }
  } else if (topic === 'guide') {
    const x = 145 + draw * 140;
    cursor = [x, 200];
    scene = (
      <Plan>
        <path d="M145 65V274" stroke={ink} strokeWidth="2" />
        <path d={`M${x} 60V285`} stroke={orange} strokeWidth="2" strokeDasharray="8 6" />
        <Polyline
          p={[
            [145, 200],
            [x, 200],
          ]}
        />
        <Dot p={[145, 200]} />
        {draw > 0.1 && (
          <Label x={(145 + x) / 2} y={181}>
            {Math.round(draw * 100)} mm
          </Label>
        )}
      </Plan>
    );
  } else if (topic === 'dimension') {
    const y = 210 - draw * 90;
    cursor = stage === 0 ? [135, 210] : stage === 1 ? [425, 210] : [280, y];
    scene = (
      <>
        <rect x="135" y="210" width="290" height="40" fill={light} stroke={ink} />
        <Dot p={[135, 210]} />
        {stage > 0 && <Dot p={[425, 210]} />}
        {stage > 0 && (
          <>
            <path
              d={`M135 207V${y - 12} M425 207V${y - 12} M135 ${y}H425 M130 ${y + 6}l10 -12 M420 ${y + 6}l10 -12`}
              fill="none"
              stroke={green}
              strokeWidth="1.5"
            />
            <Label x={280} y={y - 18}>
              600 mm
            </Label>
          </>
        )}
      </>
    );
  } else if (topic === 'area') {
    cursor =
      stage === 0
        ? lerp([135, 100], [315, 205], clamp(progress * 3))
        : lerp([240, 155], [425, 250], draw);
    scene = (
      <>
        <rect
          x="135"
          y="100"
          width="180"
          height="105"
          fill="#6da199"
          fillOpacity=".3"
          stroke={green}
        />
        {stage > 0 && (
          <rect
            x="240"
            y="155"
            width={185 * draw}
            height={95 * draw}
            fill="#6da199"
            fillOpacity=".3"
            stroke={orange}
          />
        )}{' '}
        {done && (
          <>
            <path
              d="M135 100H315V155H425V250H240V205H135Z"
              fill="#9cc4b8"
              stroke={green}
              strokeWidth="2"
            />
            <Label x={280} y={172}>
              1,5 m²
            </Label>
          </>
        )}
        <Dot p={[135, 100]} />
      </>
    );
  } else if (topic === 'note') {
    cursor = lerp([155, 220], [330, 115], draw);
    scene = (
      <>
        <Plan />
        <Dot p={[155, 220]} />
        {stage > 0 && (
          <>
            <Polyline p={[[155, 220], cursor]} color={green} />
            <rect
              x={cursor[0] - 10}
              y={cursor[1] - 30}
              width="150"
              height="42"
              rx="8"
              fill="#fff0c9"
              stroke="#ddc9a0"
            />
            {done && (
              <text
                x={cursor[0] + 65}
                y={cursor[1] - 5}
                textAnchor="middle"
                fill={ink}
                fontSize="13"
              >
                Tähän laattalista
              </text>
            )}
          </>
        )}
      </>
    );
  } else if (['paint', 'texture'].includes(topic)) {
    cursor = lerp([210, 170], [350, 170], draw);
    scene = (
      <>
        <Plan />
        {topic === 'paint' ? (
          <rect
            x="110"
            y="85"
            width="340"
            height="165"
            fill="#b27957"
            opacity={draw}
            stroke={ink}
          />
        ) : (
          <rect x="110" y="85" width="340" height="165" fill={`url(#${id}-wood)`} stroke={ink} />
        )}
        <circle cx={cursor[0]} cy={cursor[1]} r="20" fill="none" stroke={orange} strokeWidth="2" />
        {topic === 'texture' && (
          <Label x={280} y={283}>
            {Math.round(draw * 45)}°
          </Label>
        )}
      </>
    );
  } else if (topic === 'loft') {
    cursor = stage === 0 ? [205, 245] : stage === 1 ? [235, 80] : [350, 160];
    scene = (
      <>
        {stage > 0 && (
          <path
            d="M180 230 C180 180 235 150 235 90 A45 15 0 0 1 325 90 C325 150 380 180 380 230 A100 25 0 0 1 180 230"
            fill={light}
            fillOpacity={draw * 0.85}
            stroke={green}
          />
        )}
        <ellipse cx="280" cy="230" rx="100" ry="25" fill="none" stroke={orange} strokeWidth="2" />
        <ellipse
          cx="280"
          cy="90"
          rx="45"
          ry="15"
          fill="none"
          stroke={stage > 0 ? orange : green}
          strokeWidth="2"
        />
        <text x="165" y="240" fontSize="15" fill={ink}>
          1
        </text>
        <text x="215" y="95" fontSize="15" fill={ink}>
          2
        </text>
      </>
    );
  } else if (topic === 'cabinet') {
    cursor = stage === 0 ? [380, 235] : stage === 1 ? [320, 172] : [430, 270];
    scene = (
      <>
        <path d="M170 72H390V260H170Z" fill="#e3e8db" stroke={ink} />
        <path d="M180 82H380V248H180Z" fill="#f5f7f0" stroke={ink} />
        <path d="M170 72L210 48H430L390 72Z" fill="#c1cfb7" stroke={ink} />
        <path d="M390 72L430 48V236L390 260Z" fill="#c1cfb7" stroke={ink} />
        {stage > 0 && <path d="M180 170H380L408 154H208Z" fill="#beccba" stroke={orange} />}
        <Polyline
          p={[
            [155, 72],
            [155, 260],
          ]}
          dash
        />
        {stage > 0 && (
          <Label x={280} y={287}>
            18 mm levy
          </Label>
        )}
      </>
    );
  } else if (topic === 'reference') {
    cursor = lerp([150, 245], [400, 245], draw);
    scene = (
      <g
        transform={`translate(${280 * (1 - draw * 0.15 - 1)} ${165 * (1 - draw * 0.15 - 1)}) scale(${1 + draw * 0.15})`}
      >
        <rect x="115" y="70" width="310" height="190" fill="#fffefa" stroke="#ccd2c5" />
        <path
          d="M145 95H390V235H145Z M270 95V175 M145 180H215"
          fill="none"
          stroke="#a0ab98"
          strokeWidth="8"
        />
        <path
          d="M145 95H390V235H145Z M270 95V175 M145 180H215"
          fill="none"
          stroke="#5c6955"
          strokeWidth="1"
        />
        {stage > 0 && (
          <>
            <Polyline
              p={[
                [150, 245],
                [400, 245],
              ]}
            />
            <Dot p={[150, 245]} />
            <Dot p={[400, 245]} />
            <Label x={275} y={275}>
              2000 mm
            </Label>
          </>
        )}
      </g>
    );
  } else if (topic === 'section') {
    const x = 180 + draw * 125;
    cursor = [x, 130];
    scene = (
      <>
        <Box opacity={0.45} />
        <polygon
          points={`${x},68 ${x + 86},105 ${x + 86},257 ${x},219`}
          fill="#ddc7a1"
          fillOpacity=".5"
          stroke={orange}
          strokeWidth="2"
        />
        <Polyline
          p={[
            [180, 280],
            [390, 280],
          ]}
          dash
        />
        {done && (
          <Label x={280} y={290}>
            Vain näkymä
          </Label>
        )}
      </>
    );
  } else {
    // Object selection: containment rectangle, then Shift-add another object.
    cursor = lerp([115, 85], [344, 245], draw);
    scene = (
      <>
        <rect
          x="135"
          y="110"
          width="75"
          height="105"
          fill={light}
          stroke={stage > 0 ? orange : ink}
          strokeWidth={stage > 0 ? 2.5 : 1}
        />
        <rect
          x="240"
          y="110"
          width="75"
          height="105"
          fill={light}
          stroke={stage > 0 ? orange : ink}
          strokeWidth={stage > 0 ? 2.5 : 1}
        />
        <rect
          x="360"
          y="110"
          width="75"
          height="105"
          fill={light}
          stroke={done ? orange : ink}
          strokeWidth={done ? 2.5 : 1}
        />
        {!done && (
          <rect
            x="115"
            y="85"
            width={229 * draw}
            height={160 * draw}
            fill="#6a9eac"
            fillOpacity=".12"
            stroke="#648ca3"
          />
        )}
      </>
    );
    if (done) cursor = [394, 160];
  }
  return (
    <svg
      className="guide-scene"
      viewBox="0 0 560 320"
      role="img"
      aria-label={`Havainneanimaatio: ${title ?? topic}`}
      data-scene={topic}
      data-progress={progress.toFixed(3)}
    >
      <defs>
        <pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".8" fill="#d9e0d5" />
        </pattern>
        <radialGradient id={`${id}-ball`} cx="32%" cy="25%">
          <stop stopColor="#f8fbef" />
          <stop offset=".65" stopColor="#adc5a6" />
          <stop offset="1" stopColor="#6e8d6a" />
        </radialGradient>
        <pattern
          id={`${id}-wood`}
          width="36"
          height="160"
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${draw * 30} 0) rotate(${draw * 45} 280 170)`}
        >
          <rect width="36" height="160" fill="#c3a07a" />
          <path
            d="M5 0Q25 45 8 85T10 160M21 0Q2 55 28 110T26 160"
            stroke="#93704c"
            strokeWidth="2"
            fill="none"
            opacity=".55"
          />
        </pattern>
      </defs>
      <rect width="560" height="320" rx="12" fill="#f5f7f0" />
      <rect width="560" height="320" rx="12" fill={`url(#${id}-grid)`} />
      {scene}
      <Cursor p={cursor} click={click} />
    </svg>
  );
}
