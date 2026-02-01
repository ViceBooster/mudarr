export const isEnabled = (value: string | undefined) =>
  value?.toLowerCase() === "true" || value === "1";
