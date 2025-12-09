"use client";
import { Card, CardContent, CardLoader } from "@/components/ui/card";
import { User, Users } from "lucide-react";
import { Tilt_Warp } from "next/font/google";
import Link from "next/link";
import { useGetOverview } from "../../../../../api/analytics/hooks/useGetOverview";
import { useGetOverviewBucketed } from "../../../../../api/analytics/hooks/useGetOverviewBucketed";
import { BucketSelection } from "../../../../../components/BucketSelection";
import { RybbitLogo } from "../../../../../components/RybbitLogo";
import { authClient } from "../../../../../lib/auth";
import { useStore } from "../../../../../lib/store";
import { cn } from "../../../../../lib/utils";
import { ExportButton } from "../ExportButton";
import { Chart } from "./Chart";
import { Overview } from "./Overview";
import { PreviousChart } from "./PreviousChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../../components/ui/tooltip";
import { Button } from "../../../../../components/ui/button";

const SELECTED_STAT_MAP = {
  pageviews: "Pageviews",
  sessions: "Sessions",
  pages_per_session: "Pages per Session",
  bounce_rate: "Bounce Rate",
  session_duration: "Session Duration",
  users: "Users",
};

const tilt_wrap = Tilt_Warp({
  subsets: ["latin"],
  weight: "400",
});

export function MainSection() {
  const session = authClient.useSession();

  const { selectedStat, time, site, bucket, showUsersSplit, setShowUsersSplit } = useStore();
  const showUserBreakdown = selectedStat === "users" && showUsersSplit;

  // Current period data
  const { data, isFetching, error } = useGetOverviewBucketed({
    site,
    bucket,
  });

  // Previous period data
  const {
    data: previousData,
    isFetching: isPreviousFetching,
    error: previousError,
  } = useGetOverviewBucketed({
    periodTime: "previous",
    site,
    bucket,
  });

  const { isFetching: isOverviewFetching } = useGetOverview({ site });
  const { isFetching: isOverviewFetchingPrevious } = useGetOverview({
    site,
    periodTime: "previous",
  });

  const activeKeys = showUserBreakdown ? (["new_users", "returning_users"] as const) : ([selectedStat] as const);

  const getMaxValue = (dataset?: { data?: Record<string, number | string>[] }) =>
    Math.max(
      ...(dataset?.data?.map(d =>
        showUserBreakdown
          ? Number(d?.["new_users"] ?? 0) + Number(d?.["returning_users"] ?? 0)
          : Math.max(...activeKeys.map(key => Number(d?.[key] ?? 0)))
      ) ?? [0])
    );

  const maxOfDataAndPreviousData = Math.max(getMaxValue(data), getMaxValue(previousData));

  return (
    <>
      <Card>
        <CardContent className="p-0 w-full">
          <Overview />
        </CardContent>
        {(isOverviewFetching || isOverviewFetchingPrevious) && <CardLoader />}
      </Card>
      <Card className="overflow-visible">
        {(isFetching || isPreviousFetching) && <CardLoader />}
        <CardContent className="p-2 md:p-4 py-3 w-full">
          <div className="flex gap-2 justify-between items-center px-2 md:px-0 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  href={session.data ? "/" : "https://rybbit.com"}
                  className={cn("text-lg font-semibold flex items-center gap-1.5 opacity-75", tilt_wrap.className)}
                >
                  <RybbitLogo width={20} height={20} />
                  rybbit.com
                </Link>
              </div>
            </div>
            <span className="text-sm text-neutral-700 dark:text-neutral-200">{SELECTED_STAT_MAP[selectedStat]}</span>
            <div className="flex items-center">
              {selectedStat === "users" && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger>
                      <Button variant="ghost" size="smIcon" onClick={() => setShowUsersSplit(!showUsersSplit)}>
                        {showUsersSplit ? <Users /> : <User />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{showUsersSplit ? "Hide new vs returning users" : "Show new vs returning users"}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              <ExportButton />
              <div className="pl-1">
                <BucketSelection />
              </div>
            </div>
          </div>

          <div className="h-[200px] md:h-[290px] relative">
            <div className="absolute top-0 left-0 w-full h-full">
              <PreviousChart data={previousData} max={maxOfDataAndPreviousData} />
            </div>
            <div className="absolute top-0 left-0 w-full h-full">
              <Chart
                data={data}
                max={maxOfDataAndPreviousData}
                previousData={time.mode === "all-time" ? undefined : previousData}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
