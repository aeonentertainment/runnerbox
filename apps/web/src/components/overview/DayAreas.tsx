import { dayName, niceTicks } from "../../lib/chartScale.ts";
import { curvePath, smoothCurve } from "../../lib/curve.ts";
import { CHART, columnWidth, columnX, valueY } from "./dayChart.ts";
import { DayAxes } from "./DayAxes.tsx";
import { DayChart } from "./DayChart.tsx";

// `color` is any CSS colour, a theme variable included.
type Series = { readonly label: string; readonly color: string; readonly values: ReadonlyArray<number> };

// Counts per day drawn the T3 Code way, as its usage chart layers providers (see
// THIRD_PARTY_NOTICES.md): each series a monotone curve over a faint fill, every one from zero
// rather than stacked, so a small series stays readable under a large one. The largest is drawn
// first, behind the rest. Each day's hover title gives every series' count.
export function DayAreas({ days, series, label }: { days: ReadonlyArray<string>; series: ReadonlyArray<Series>; label: string }) {
  // Layered series share one scale, set by the largest single value, not by a day's sum.
  const ticks = niceTicks(Math.max(...series.flatMap((each) => each.values), 0));
  const top = ticks.at(-1) ?? 1;
  const total = (each: Series) => each.values.reduce((sum, value) => sum + value, 0);
  const ordered = series.toSorted((a, b) => total(b) - total(a));
  return (
    <DayChart label={label}>
      {(width) => {
        const slot = columnWidth(days.length, width);
        const shapes = ordered.map((each) => {
          const points = days.map((_, index) => ({ x: columnX(index, days.length, width), y: valueY(each.values[index] ?? 0, top) }));
          const line = curvePath(smoothCurve(points));
          const first = points[0];
          const last = points.at(-1);
          return { ...each, points, line, area: line === "" || !first || !last ? "" : `${line} L${last.x},${CHART.base} L${first.x},${CHART.base} Z` };
        });
        return (
          <>
            <DayAxes days={days} ticks={ticks} format={(value) => value.toLocaleString()} width={width} />
            {shapes.map((shape) => (
              <path key={shape.label} d={shape.area} style={{ fill: shape.color, fillOpacity: 0.12 }} />
            ))}
            {shapes.map((shape) =>
              // One day has no line to draw, so it gets a dot.
              shape.line === "" ? (
                shape.points.map((point) => <circle key={shape.label} cx={point.x} cy={point.y} r={3} style={{ fill: shape.color }} />)
              ) : (
                <path key={shape.label} d={shape.line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: shape.color }} />
              ),
            )}
            {days.map((day, index) => (
              <rect key={day} x={columnX(index, days.length, width) - slot / 2} y={CHART.top} width={slot} height={CHART.base - CHART.top} fill="transparent">
                <title>{`${dayName(day)}: ${series.map((each) => `${(each.values[index] ?? 0).toLocaleString()} ${each.label.toLowerCase()}`).join(", ")}`}</title>
              </rect>
            ))}
          </>
        );
      }}
    </DayChart>
  );
}
