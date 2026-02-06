import { useRef, useState } from "react";
import type { FrequencyStats, CoverageCurveData } from "~/lib/types";

type FreqView = "bars" | "coverage";

function setViewCookie(view: FreqView) {
  document.cookie = `freq-view=${encodeURIComponent(JSON.stringify(view))};path=/;max-age=31536000;SameSite=Lax`;
}

function CoverageCurveChart({ data }: { data: CoverageCurveData }) {
  const chartWidth = 600;
  const chartHeight = 200;
  const leftMargin = 55;
  const bottomMargin = 45;
  const topMargin = 10;
  const rightMargin = 10;
  const totalWidth = leftMargin + chartWidth + rightMargin;
  const totalHeight = topMargin + chartHeight + bottomMargin;

  const maxRank = 10000;
  const xScale = (rank: number) => leftMargin + (rank / maxRank) * chartWidth;
  const yScale = (pct: number) => topMargin + chartHeight - (pct / 100) * chartHeight;

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = [0, 2000, 4000, 6000, 8000, 10000];

  type PointKey = "zipfPercent" | "hsk16Percent" | "hskAllPercent" | "trackedPercent";

  function areaPath(key: PointKey) {
    const pts = data.points;
    if (pts.length === 0) return "";
    const segments = pts.map((p) => `L${xScale(p.rank)},${yScale(p[key])}`).join("");
    return `M${xScale(pts[0].rank)},${yScale(0)}${segments}L${xScale(pts[pts.length - 1].rank)},${yScale(0)}Z`;
  }

  function linePath(key: PointKey) {
    const pts = data.points;
    if (pts.length === 0) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.rank)},${yScale(p[key])}`).join("");
  }

  return (
    <>
      <div className="freq-chart">
        <svg viewBox={`0 0 ${totalWidth} ${totalHeight}`} className="freq-svg coverage-svg">
          <g>
            {/* Y-axis label */}
            <text
              x={14}
              y={topMargin + chartHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90, 14, ${topMargin + chartHeight / 2})`}
              className="freq-axis-label"
            >
              Text coverage
            </text>

            {/* Y gridlines + labels */}
            {yTicks.map((tick) => (
              <g key={tick}>
                <text
                  x={leftMargin - 6}
                  y={yScale(tick) + 3}
                  textAnchor="end"
                  className="freq-label"
                >
                  {tick}%
                </text>
                <line
                  x1={leftMargin}
                  y1={yScale(tick)}
                  x2={leftMargin + chartWidth}
                  y2={yScale(tick)}
                  className="freq-gridline"
                />
              </g>
            ))}

            {/* X gridlines + labels */}
            {xTicks.map((tick) => (
              <g key={tick}>
                <text
                  x={xScale(tick)}
                  y={topMargin + chartHeight + 16}
                  textAnchor="middle"
                  className="freq-label"
                >
                  {tick === 0 ? "0" : `${tick / 1000}k`}
                </text>
                {tick > 0 && (
                  <line
                    x1={xScale(tick)}
                    y1={topMargin}
                    x2={xScale(tick)}
                    y2={topMargin + chartHeight}
                    className="freq-gridline"
                  />
                )}
              </g>
            ))}

            {/* Zipf theoretical curve - dashed line */}
            <path d={linePath("zipfPercent")} className="curve-zipf-line" />

            {/* HSK 7-9 area (total HSK minus 1-6, rendered first so 1-6 paints on top) */}
            <path d={areaPath("hskAllPercent")} className="curve-hsk79-area" />
            <path d={linePath("hskAllPercent")} className="curve-hsk79-line" />

            {/* HSK 1-6 area */}
            <path d={areaPath("hsk16Percent")} className="curve-hsk16-area" />
            <path d={linePath("hsk16Percent")} className="curve-hsk16-line" />

            {/* Tracked area fill */}
            <path d={areaPath("trackedPercent")} className="curve-tracked-area" />
            <path d={linePath("trackedPercent")} className="curve-tracked-line" />

            {/* X-axis label */}
            <text
              x={leftMargin + chartWidth / 2}
              y={topMargin + chartHeight + 38}
              textAnchor="middle"
              className="freq-axis-label"
            >
              Word frequency rank (1 = most common)
            </text>
          </g>
        </svg>
      </div>
      <div className="freq-legend">
        <span className="legend-item">
          <span className="legend-swatch legend-zipf" /> Zipf theoretical
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-hsk16" /> HSK 1-6
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-hsk79" /> HSK 7-9
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-tracked" /> Your tracked words
        </span>
      </div>
    </>
  );
}

function BarChart({ stats, isHsk7 }: { stats: FrequencyStats; isHsk7?: boolean }) {
  const maxCount = Math.max(...stats.buckets.map((b) => b.hskCount), 1);
  const chartHeight = 160;
  const topMargin = 14;
  const leftMargin = 50;
  const bottomMargin = 40;
  const chartWidth = stats.buckets.length * 32;
  const totalWidth = leftMargin + chartWidth;
  const totalHeight = topMargin + chartHeight + bottomMargin;
  const yTicks = [0, Math.round(maxCount / 2), maxCount];

  const [activeBar, setActiveBar] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleBarInteraction = (i: number) => {
    if (activeBar === i) {
      setActiveBar(null);
      return;
    }
    setActiveBar(i);
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgScale = rect.width / totalWidth;
    const bucket = stats.buckets[i];
    const barHeight = (bucket.hskCount / maxCount) * chartHeight;
    const barTopInSvg = topMargin + (chartHeight - barHeight);
    const barX = (leftMargin + i * 32 + 4 + 12) * svgScale + rect.left;
    const barY = rect.top + barTopInSvg * svgScale;
    setTooltipPos({ x: barX, y: barY });
  };

  return (
    <>
      <div className="freq-chart" onMouseLeave={() => setActiveBar(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${totalWidth} ${totalHeight}`} className="freq-svg">
          <g transform={`translate(0, ${topMargin})`}>
            <text
              x={12}
              y={chartHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90, 12, ${chartHeight / 2})`}
              className="freq-axis-label"
            >
              # of words
            </text>

            {yTicks.map((tick) => {
              const y = chartHeight - (tick / maxCount) * chartHeight;
              return (
                <g key={tick}>
                  <text x={leftMargin - 6} y={y + 3} textAnchor="end" className="freq-label">
                    {tick}
                  </text>
                  <line x1={leftMargin} y1={y} x2={totalWidth} y2={y} className="freq-gridline" />
                </g>
              );
            })}

            {stats.buckets.map((bucket, i) => {
              const hskHeight = (bucket.hskCount / maxCount) * chartHeight;
              const trackedHeight = (bucket.trackedCount / maxCount) * chartHeight;
              const x = leftMargin + i * 32 + 4;
              const barWidth = 24;
              return (
                <g
                  key={bucket.rangeLabel}
                  onMouseEnter={() => handleBarInteraction(i)}
                  onClick={() => handleBarInteraction(i)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Invisible hit area covering the full bar height */}
                  <rect x={x} y={0} width={barWidth} height={chartHeight} fill="transparent" />
                  <rect x={x} y={chartHeight - hskHeight} width={barWidth} height={hskHeight} className="freq-bar-hsk" />
                  <rect x={x} y={chartHeight - trackedHeight} width={barWidth} height={trackedHeight} className="freq-bar-tracked" />
                  {i % 4 === 0 && (
                    <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" className="freq-label">
                      {bucket.min}
                    </text>
                  )}
                </g>
              );
            })}

            <text x={leftMargin + chartWidth / 2} y={chartHeight + 34} textAnchor="middle" className="freq-axis-label">
              Word frequency rank (1 = most common)
            </text>
          </g>
        </svg>
        {activeBar !== null && (() => {
          const bucket = stats.buckets[activeBar];
          const pctHsk = stats.totalWords > 0 ? ((bucket.hskCount / stats.totalWords) * 100).toFixed(1) : "0";
          const pctTracked = bucket.hskCount > 0 ? ((bucket.trackedCount / bucket.hskCount) * 100).toFixed(1) : "0";
          return (
            <div
              className="bar-tooltip"
              style={{ left: tooltipPos.x, top: tooltipPos.y, position: "fixed" }}
            >
              <div className="bar-tooltip-title">Rank {bucket.rangeLabel}</div>
              <div>{bucket.trackedCount} / {bucket.hskCount} tracked ({pctTracked}%)</div>
              <div>{bucket.hskCount} / {stats.totalWords} total ({pctHsk}%)</div>
            </div>
          );
        })()}
      </div>
      <div className="freq-legend">
        <span className="legend-item">
          <span className="legend-swatch legend-hsk" /> HSK words
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-tracked" /> Tracked
        </span>
      </div>
    </>
  );
}

export function FrequencyCoverage({
  stats,
  coverageCurve,
  initialView,
  isHsk7,
}: {
  stats: FrequencyStats;
  coverageCurve: CoverageCurveData;
  initialView: FreqView;
  isHsk7?: boolean;
}) {
  const [view, setView] = useState<FreqView>(initialView);

  function handleViewChange(newView: FreqView) {
    setView(newView);
    setViewCookie(newView);
  }

  return (
    <div className="freq-coverage">
      <div className="freq-header">
        <h2>Frequency Coverage</h2>
        <div className="freq-header-right">
          {view === "coverage" ? (
            <span className="freq-summary">
              Your tracked words cover ~{coverageCurve.totalTrackedPercent}% of typical Chinese text
            </span>
          ) : (
            <span className="freq-summary">
              {isHsk7 ? (
                <>
                  {stats.totalTracked} / {stats.totalWords} total HSK words tracked
                </>
              ) : (
                <>
                  {stats.totalTracked} / {stats.totalWords} HSK words tracked
                </>
              )}
            </span>
          )}
          <div className="freq-view-toggle">
            <button
              className={`freq-view-btn ${view === "bars" ? "active" : ""}`}
              onClick={() => handleViewChange("bars")}
            >
              Word Count
            </button>
            <button
              className={`freq-view-btn ${view === "coverage" ? "active" : ""}`}
              onClick={() => handleViewChange("coverage")}
            >
              Text Coverage
            </button>
          </div>
        </div>
      </div>

      {view === "bars" ? (
        <BarChart stats={stats} isHsk7={isHsk7} />
      ) : (
        <CoverageCurveChart data={coverageCurve} />
      )}
    </div>
  );
}
