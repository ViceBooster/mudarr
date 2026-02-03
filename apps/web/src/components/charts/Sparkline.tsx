import React, { useId, useMemo } from "react";

import { DASHBOARD_STATS_RENDER_POINTS } from "../../constants/ui";
import { buildSparklinePaths, downsampleSeries } from "../../utils/charts";

type SparklineProps = {
  values: number[];
  strokeClassName: string;
  gradientFrom: string;
  gradientTo: string;
};

export const Sparkline = ({ values, strokeClassName, gradientFrom, gradientTo }: SparklineProps) => {
  const gradientId = useId().replace(/:/g, "");
  const sampledValues = useMemo(
    () => downsampleSeries(values, DASHBOARD_STATS_RENDER_POINTS),
    [values]
  );
  const { linePath, areaPath } = useMemo(
    () => buildSparklinePaths(sampledValues, 100, 40, 4),
    [sampledValues]
  );
  if (!linePath) return null;
  return (
    <svg className="h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.45" />
          <stop offset="100%" stopColor={gradientTo} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        className={`${strokeClassName} opacity-70`}
        fill="none"
        strokeWidth="1.6"
      />
    </svg>
  );
};

