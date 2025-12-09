"use client";
import { useNivoTheme } from "@/lib/nivo";
import { StatType, useStore } from "@/lib/store";
import { ResponsiveLine } from "@nivo/line";
import { TimeBucket } from "@rybbit/shared";
import { useWindowSize } from "@uidotdev/usehooks";
import { DateTime } from "luxon";
import { useTheme } from "next-themes";
import { GetOverviewBucketedResponse } from "../../../../../api/analytics/endpoints";
import { APIResponse } from "../../../../../api/types";
import { Time } from "../../../../../components/DateSelector/types";
import { hour12, userLocale } from "../../../../../lib/dateTimeUtils";
import { formatter } from "../../../../../lib/utils";
import { ChartSliceTooltip, SeriesData } from "./ChartSliceTooltip";

const BUCKET_MINUTES_OFFSET: Partial<Record<TimeBucket, number>> = {
  hour: 59,
  fifteen_minutes: 14,
  ten_minutes: 9,
  five_minutes: 4,
};

const getBucketMinutesOffset = (bucket: TimeBucket): number => BUCKET_MINUTES_OFFSET[bucket] ?? 0;

const getMax = (time: Time, bucket: TimeBucket) => {
  const now = DateTime.now();
  if (time.mode === "past-minutes") {
    if (bucket === "hour") {
      return DateTime.now().setZone("UTC").startOf("hour").toJSDate();
    }
    return undefined;
  } else if (time.mode === "day") {
    const dayDate = DateTime.fromISO(time.day)
      .endOf("day")
      .minus({ minutes: getBucketMinutesOffset(bucket) });
    return now < dayDate ? dayDate.toJSDate() : undefined;
  } else if (time.mode === "range") {
    if (bucket === "day" || bucket === "week" || bucket === "month" || bucket === "year") {
      return undefined;
    }
    const rangeDate = DateTime.fromISO(time.endDate)
      .endOf("day")
      .minus({ minutes: getBucketMinutesOffset(bucket) });
    return now < rangeDate ? rangeDate.toJSDate() : undefined;
  } else if (time.mode === "week") {
    if (bucket !== "hour" && bucket !== "fifteen_minutes") {
      return undefined;
    }
    const endDate = DateTime.fromISO(time.week)
      .endOf("week")
      .minus({ minutes: getBucketMinutesOffset(bucket) });
    return now < endDate ? endDate.toJSDate() : undefined;
  } else if (time.mode === "month") {
    if (bucket === "hour") {
      const endDate = DateTime.fromISO(time.month)
        .endOf("month")
        .minus({ minutes: getBucketMinutesOffset(bucket) });
      return now < endDate ? endDate.toJSDate() : undefined;
    }
    const monthDate = DateTime.fromISO(time.month).endOf("month");
    return now < monthDate ? monthDate.toJSDate() : undefined;
  } else if (time.mode === "year") {
    const yearDate = DateTime.fromISO(time.year).endOf("year");
    return now < yearDate ? yearDate.toJSDate() : undefined;
  }
  return undefined;
};

const getMin = (time: Time, bucket: TimeBucket) => {
  if (time.mode === "past-minutes") {
    return DateTime.now()
      .minus({ minutes: time.pastMinutesStart })
      .startOf(time.pastMinutesStart < 360 ? "minute" : "hour")
      .toJSDate();
  } else if (time.mode === "day") {
    const dayDate = DateTime.fromISO(time.day).startOf("day");
    return dayDate.toJSDate();
  } else if (time.mode === "week") {
    const weekDate = DateTime.fromISO(time.week).startOf("week");
    return weekDate.toJSDate();
  } else if (time.mode === "month") {
    const monthDate = DateTime.fromISO(time.month).startOf("month");
    return monthDate.toJSDate();
  } else if (time.mode === "year") {
    const yearDate = DateTime.fromISO(time.year).startOf("year");
    return yearDate.toJSDate();
  }
  return undefined;
};

const Y_TICK_VALUES = 5;

const SERIES_LABELS: Record<StatType | "new_users" | "returning_users", string> = {
  pageviews: "Pageviews",
  sessions: "Sessions",
  pages_per_session: "Pages per Session",
  bounce_rate: "Bounce Rate",
  session_duration: "Session Duration",
  users: "Users",
  new_users: "New Users",
  returning_users: "Returning Users",
};

type SeriesConfig = {
  id: string;
  dataKey: keyof GetOverviewBucketedResponse[number];
  label: string;
  color: string;
};

const createStackedLines =
  (displayDashed: boolean) =>
  ({ series, lineGenerator, xScale, yScale }: any) => {
    return series.map(({ id, data, color }: any) => {
      const usableData = displayDashed && data.length >= 2 ? data.slice(0, -1) : data;
      const coords = usableData.map((d: any) => {
        const stackedY = d.data.yStacked ?? d.data.y;
        return { x: xScale(d.data.x), y: yScale(stackedY) };
      });
      const path = lineGenerator(coords);
      if (!path) return null;
      return <path key={`${id}-solid`} d={path} fill="none" stroke={color} style={{ strokeWidth: 2 }} />;
    });
  };

const createDashedOverlay =
  (displayDashed: boolean) =>
  ({ series, lineGenerator, xScale, yScale }: any) => {
    return series.map(({ id, data, color }: any) => {
      if (!displayDashed || data.length < 2) return null;
      const lastTwo = data.slice(-2);
      const coords = lastTwo.map((d: any) => {
        const stackedY = d.data.yStacked ?? d.data.y;
        return { x: xScale(d.data.x), y: yScale(stackedY) };
      });
      const path = lineGenerator(coords);
      if (!path) return null;
      return (
        <path
          key={`${id}-dashed`}
          d={path}
          fill="none"
          stroke={color}
          style={{ strokeDasharray: "3, 6", strokeWidth: 3 }}
        />
      );
    });
  };

const useChartData = ({
  data,
  previousData,
}: {
  data: APIResponse<GetOverviewBucketedResponse> | undefined;
  previousData: APIResponse<GetOverviewBucketedResponse> | undefined;
}) => {
  const { time, bucket, selectedStat, showUsersSplit } = useStore();

  const showUserBreakdown = selectedStat === "users" && showUsersSplit;

  // When the current period has more datapoints than the previous period,
  // we need to shift the previous datapoints to the right by the difference in length
  const lengthDiff = Math.max((data?.data?.length ?? 0) - (previousData?.data?.length ?? 0), 0);

  const seriesConfig: SeriesConfig[] = showUserBreakdown
    ? [
        {
          id: "returning_users",
          dataKey: "returning_users",
          label: SERIES_LABELS["returning_users"],
          color: "hsl(var(--indigo-400))",
        },
        {
          id: "new_users",
          dataKey: "new_users",
          label: SERIES_LABELS["new_users"],
          color: "hsl(var(--dataviz))",
        },
      ]
    : [
        {
          id: selectedStat,
          dataKey: selectedStat,
          label: SERIES_LABELS[selectedStat],
          color: "hsl(var(--dataviz))",
        },
      ];

  const seriesData = seriesConfig.map(config => {
    const points =
      data?.data
        ?.map((e, i) => {
          // Parse timestamp properly
          const timestamp = DateTime.fromSQL(e.time).toUTC();

          // filter out dates from the future
          if (timestamp > DateTime.now()) {
            return null;
          }

          const previousEntry = i >= lengthDiff ? previousData?.data?.[i - lengthDiff] : undefined;
          const previousTimestamp = previousEntry ? DateTime.fromSQL(previousEntry.time).toUTC() : undefined;

          return {
            x: timestamp.toFormat("yyyy-MM-dd HH:mm:ss"),
            y: (e as any)[config.dataKey] ?? 0,
            previousY: previousEntry ? (previousEntry as any)[config.dataKey] : undefined,
            currentTime: timestamp,
            previousTime: previousTimestamp,
          };
        })
        .filter(e => e !== null) ?? [];

    return { ...config, points };
  });

  const currentDayStr = DateTime.now().toISODate();
  const currentMonthStr = DateTime.now().toFormat("yyyy-MM-01");
  const shouldNotDisplay =
    time.mode === "all-time" || // do not display in all-time mode
    time.mode === "year" || // do not display in year mode
    (time.mode === "month" && time.month !== currentMonthStr) || // do not display in month mode if month is not current
    (time.mode === "day" && time.day !== currentDayStr) || // do not display in day mode if day is not current
    (time.mode === "range" && time.endDate !== currentDayStr) || // do not display in range mode if end date is not current day
    (time.mode === "day" && (bucket === "minute" || bucket === "five_minutes")) || // do not display in day mode if bucket is minute or five_minutes
    (time.mode === "past-minutes" && (bucket === "minute" || bucket === "five_minutes")); // do not display in 24-hour mode if bucket is minute or five_minutes

  const displayDashed = (seriesData[0]?.points.length ?? 0) >= 2 && !shouldNotDisplay;

  const chartPropsData: { id: string; data: any[] }[] = [];
  const chartPropsDefs: any[] = [];
  const chartPropsFill: any[] = [];
  const colorMap: Record<string, string> = {};

  seriesData.forEach(series => {
    const baseId = `${series.id}-base`;
    const baseData = series.points;

    chartPropsData.push({
      id: baseId,
      data: baseData,
    });
    colorMap[baseId] = series.color;

    chartPropsDefs.push({
      id: `${baseId}-gradient`,
      type: "linearGradient",
      colors: [
        { offset: 0, color: series.color, opacity: showUserBreakdown ? 0.5 : 0.7 },
        { offset: 100, color: series.color, opacity: 0 },
      ],
    });
    chartPropsFill.push({
      id: `${baseId}-gradient`,
      match: {
        id: baseId,
      },
    });
  });
  return {
    seriesData,
    displayDashed,
    chartPropsData,
    chartPropsDefs,
    chartPropsFill,
    colorMap,
    seriesConfig,
  };
};

export function Chart({
  data,
  previousData,
  max,
}: {
  data: APIResponse<GetOverviewBucketedResponse> | undefined;
  previousData: APIResponse<GetOverviewBucketedResponse> | undefined;
  max: number;
}) {
  const { time, bucket, selectedStat, showUsersSplit } = useStore();
  const { width } = useWindowSize();
  const maxTicks = Math.round((width ?? Infinity) / 75);
  const nivoTheme = useNivoTheme();
  const { resolvedTheme } = useTheme();

  const showUserBreakdown = selectedStat === "users" && showUsersSplit;

  const { displayDashed, chartPropsData, chartPropsDefs, chartPropsFill, colorMap, seriesConfig, seriesData } =
    useChartData({
      data,
      previousData,
    });

  const StackedLines = createStackedLines(displayDashed);
  const DashedOverlay = createDashedOverlay(displayDashed);

  return (
    <ResponsiveLine
      data={chartPropsData}
      theme={nivoTheme}
      margin={{ top: 10, right: 15, bottom: 30, left: 40 }}
      xScale={{
        type: "time",
        format: "%Y-%m-%d %H:%M:%S",
        precision: "second",
        useUTC: true,
        max: getMax(time, bucket),
        min: getMin(time, bucket),
      }}
      yScale={{
        type: "linear",
        min: 0,
        stacked: showUserBreakdown,
        reverse: false,
        max: Math.max(max, 1),
      }}
      enableGridX={true}
      enableGridY={true}
      gridYValues={Y_TICK_VALUES}
      yFormat=" >-.2f"
      axisTop={null}
      axisRight={null}
      axisBottom={{
        tickSize: 5,
        tickPadding: 10,
        tickRotation: 0,
        truncateTickAt: 0,
        tickValues: Math.min(
          maxTicks,
          time.mode === "day" || (time.mode === "past-minutes" && time.pastMinutesStart === 1440)
            ? 24
            : Math.min(12, data?.data?.length ?? 0)
        ),
        format: value => {
          const dt = DateTime.fromJSDate(value).setLocale(userLocale);
          if (time.mode === "past-minutes") {
            if (time.pastMinutesStart < 1440) {
              return dt.toFormat(hour12 ? "h:mm" : "HH:mm");
            }
            return dt.toFormat(hour12 ? "ha" : "HH:mm");
          }
          if (time.mode === "day") {
            return dt.toFormat(hour12 ? "ha" : "HH:mm");
          }
          return dt.toFormat(hour12 ? "MMM d" : "dd MMM");
        },
      }}
      axisLeft={{
        tickSize: 5,
        tickPadding: 10,
        tickRotation: 0,
        truncateTickAt: 0,
        tickValues: Y_TICK_VALUES,
        format: formatter,
      }}
      enableTouchCrosshair={true}
      enablePoints={false}
      useMesh={true}
      animate={false}
      enableSlices={"x"}
      colors={({ id }) => colorMap[id as string] ?? "hsl(var(--dataviz))"}
      enableArea={true}
      areaBaselineValue={0}
      areaOpacity={0.3}
      defs={chartPropsDefs}
      fill={chartPropsFill}
      sliceTooltip={({ slice }: any) => (
        <ChartSliceTooltip
          slice={slice}
          showUserBreakdown={showUserBreakdown}
          colorMap={colorMap}
          seriesConfig={seriesConfig}
          seriesData={seriesData as SeriesData[]}
          bucket={bucket}
          selectedStat={selectedStat}
          resolvedTheme={resolvedTheme}
        />
      )}
      layers={[
        "grid",
        "markers",
        "axes",
        "areas",
        "crosshair",
        StackedLines,
        ...(displayDashed ? [DashedOverlay] : []),
        "slices",
        "points",
        "mesh",
        "legends",
      ]}
    />
  );
}
