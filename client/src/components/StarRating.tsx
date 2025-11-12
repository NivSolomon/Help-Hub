// src/components/StarRating.tsx
import * as React from "react";

export default function StarRating({ value = 0, size = 14 }: { value?: number; size?: number }) {
  // value can be 0..5 (decimals OK)
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  const star = (fill: string, key: string) => (
    <svg
      key={key}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: "inline-block" }}
    >
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 8.25l-7.19-.62L12 1 9.19 7.63 2 8.25l5.46 5.72L5.82 21z"
        fill={fill}
      />
    </svg>
  );
  return (
    <span aria-label={`${value} stars`}>
      {Array.from({ length: full }).map((_, i) => star("#f59e0b", `f-${i}`))}
      {half ? (
        <span style={{ position: "relative", display: "inline-block" }}>
          {star("#f59e0b", "half-bg")}
          <span
            style={{
              position: "absolute",
              inset: 0,
              width: "50%",
              left: "50%",
              background: "white",
              mixBlendMode: "destination-out",
            }}
          />
        </span>
      ) : null}
      {Array.from({ length: empty }).map((_, i) => star("#d1d5db", `e-${i}`))}
    </span>
  );
}
