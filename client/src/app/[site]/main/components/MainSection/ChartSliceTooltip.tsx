"use client";
import { TimeBucket } from "@rybbit/shared";
import { DateTime } from "luxon";
import { StatType } from "@/lib/store";
import { formatSecondsAsMinutesAndSeconds } from "../../../../../lib/utils";
import { formatChartDateTime } from "../../../../../lib/dateTimeUtils";
import { ChartTooltip } from "../../../../../components/charts/ChartTooltip";

const formatTooltipValue = (value: number, selectedStat: StatType): string => {
  if (selectedStat === "bounce_rate") {
    return `${value.toFixed(1)}%`;
  }
  if (selectedStat === "session_duration") {
    return formatSecondsAsMinutesAndSeconds(value);
  }
  return value.toLocaleString();
};

export type SeriesConfig = {
  id: string;
  dataKey: string;
  label: string;
  color: string;
};

export type SeriesDataPoint = {
  x: string;
  y: number;
  previousY: number | undefined;
  currentTime: DateTime;
  previousTime: DateTime | undefined;
};

export type SeriesData = SeriesConfig & {
  points: SeriesDataPoint[];
};

type ChartSliceTooltipProps = {
  slice: any;
  showUserBreakdown: boolean;
  colorMap: Record<string, string>;
  seriesConfig: SeriesConfig[];
  seriesData: SeriesData[];
  bucket: TimeBucket;
  selectedStat: StatType;
  resolvedTheme: string | undefined;
};

export function ChartSliceTooltip({
  slice,
  showUserBreakdown,
  colorMap,
  seriesConfig,
  seriesData,
  bucket,
  selectedStat,
  resolvedTheme,
}: ChartSliceTooltipProps) {
  // Normalize dashed series ids back to their base ids so we always find a point
  const normalizedPoints = slice.points.map((point: any) => ({
    ...point,
    originalSerieId: String(point.serieId),
    serieId: String(point.serieId).replace(/-dashed$/, "-base"),
  }));

  if (!normalizedPoints.length) return null;

  // Single-series tooltip
  if (!showUserBreakdown) {
    const currentTime = normalizedPoints[0].data.currentTime as DateTime;
    const previousTime = normalizedPoints[0].data.previousTime as DateTime;
    const currentY = Number(normalizedPoints[0].data.yFormatted ?? normalizedPoints[0].data.y);
    const previousY = Number(normalizedPoints[0].data.previousY) || 0;
    const diff = currentY - previousY;
    const diffPercentage = previousY ? (diff / previousY) * 100 : null;
    const primaryColor = colorMap[`${seriesConfig[0].id}-base`] ?? "hsl(var(--dataviz))";

    return (
      <ChartTooltip>
        {diffPercentage !== null && (
          <div
            className="text-base font-medium px-2 pt-1.5 pb-1"
            style={{
              color: diffPercentage > 0 ? "hsl(var(--green-400))" : "hsl(var(--red-400))",
            }}
          >
            {diffPercentage > 0 ? "+" : ""}
            {diffPercentage.toFixed(2)}%
          </div>
        )}
        <div className="w-full h-[1px] bg-neutral-100 dark:bg-neutral-750"></div>

        <div className="m-2">
          <div className="flex justify-between text-sm w-40">
            <div className="flex items-center gap-2">
              <div className="w-1 h-3 rounded-[3px]" style={{ backgroundColor: primaryColor }} />
              {formatChartDateTime(currentTime, bucket)}
            </div>
            <div>{formatTooltipValue(currentY, selectedStat)}</div>
          </div>
          {previousTime && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-1 h-3 rounded-[3px] bg-neutral-200 dark:bg-neutral-750" />
                {formatChartDateTime(previousTime, bucket)}
              </div>
              <div>{formatTooltipValue(previousY, selectedStat)}</div>
            </div>
          )}
        </div>
      </ChartTooltip>
    );
  }

  // Two-series tooltip (new vs returning) using the slice's timestamp to fetch both series points
  const targetTime = (normalizedPoints[0].data.currentTime as DateTime | undefined)?.toMillis();

  const previousColorFor = (seriesId: string) => {
    if (seriesId === "new_users") {
      return "hsl(var(--dataviz) / 0.28)";
    }
    if (seriesId === "returning_users") {
      return resolvedTheme === "dark" ? "hsl(var(--accent-800) / 0.35)" : "hsl(var(--accent-200) / 0.38)";
    }
    return resolvedTheme === "dark" ? "hsl(var(--neutral-700))" : "hsl(var(--neutral-200))";
  };

  const rows = seriesConfig
    .map(series => {
      const match = seriesData
        .find(s => s.id === series.id)
        ?.points.find(p => {
          const t = (p.currentTime as DateTime | undefined)?.toMillis();
          return targetTime !== undefined && t === targetTime;
        });

      if (!match) return null;

      const currentY = Number(match.y ?? 0);
      const previousY = Number(match.previousY ?? 0);
      const diff = currentY - previousY;
      const diffPercentage = previousY ? (diff / previousY) * 100 : null;

      return {
        id: series.id,
        color: series.color,
        label: series.label,
        currentTime: match.currentTime as DateTime | undefined,
        previousTime: match.previousTime as DateTime | undefined,
        currentY,
        previousY,
        diffPercentage,
        previousColor: previousColorFor(series.id),
      };
    })
    .filter(Boolean);

  return (
    <ChartTooltip>
      {rows.toReversed().map((row: any, idx: number) => (
        <div key={row.id} className={idx < rows.length - 1 ? "pb-0.5 mb-1.5" : ""}>
          <div className={`px-2 text-xs font-semibold text-muted-foreground ${idx === 0 ? "pt-2" : ""}`}>
            {row.label}
          </div>
          {row.diffPercentage !== null && (
            <div
              className="text-base font-medium px-2 pt-1.5 pb-1"
              style={{
                color: row.diffPercentage > 0 ? "hsl(var(--green-400))" : "hsl(var(--red-400))",
              }}
            >
              {row.diffPercentage > 0 ? "+" : ""}
              {row.diffPercentage.toFixed(2)}%
            </div>
          )}
          {row.diffPercentage !== null && <div className="w-full h-[1px] bg-neutral-100 dark:bg-neutral-750" />}

          <div className="m-2">
            <div className="flex justify-between text-sm w-48">
              <div className="flex items-center gap-2">
                <div className="w-1 h-3 rounded-[3px]" style={{ backgroundColor: row.color }} />
                {row.currentTime ? formatChartDateTime(row.currentTime, bucket) : ""}
              </div>
              <div>{formatTooltipValue(row.currentY, selectedStat)}</div>
            </div>
            {row.previousTime && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 rounded-[3px]" style={{ backgroundColor: row.previousColor }} />
                  {formatChartDateTime(row.previousTime, bucket)}
                </div>
                <div>{formatTooltipValue(row.previousY, selectedStat)}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </ChartTooltip>
  );
}
