export const downsampleSeries = (values: number[], targetPoints: number) => {
  if (values.length <= targetPoints) return values;
  if (targetPoints <= 1) return [values[0]];
  const sampled: number[] = [];
  for (let i = 0; i < targetPoints; i += 1) {
    const ratio = i / (targetPoints - 1);
    const index = Math.round(ratio * (values.length - 1));
    sampled.push(values[index]);
  }
  return sampled;
};

export const buildSparklinePaths = (
  values: number[],
  width: number,
  height: number,
  padding: number
) => {
  if (values.length === 0) {
    return { linePath: "", areaPath: "" };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = padding + index * step;
    const y = padding + innerHeight - ((value - min) / range) * innerHeight;
    return { x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const baseY = padding + innerHeight;
  const areaPath = `${linePath} L ${padding + innerWidth},${baseY} L ${padding},${baseY} Z`;
  return { linePath, areaPath };
};

