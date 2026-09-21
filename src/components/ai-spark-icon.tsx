import { useId } from "react";

export function AiSparkIcon({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg className={className} aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 1.75C15.15 8.08 16.58 9.5 22.9 10.65C16.58 11.8 15.15 13.23 14 19.55C12.85 13.23 11.42 11.8 5.1 10.65C11.42 9.5 12.85 8.08 14 1.75Z" fill={`url(#${gradientId})`} />
      <path d="M22.15 16.2C22.72 19.34 23.43 20.05 26.58 20.63C23.43 21.2 22.72 21.91 22.15 25.05C21.58 21.91 20.86 21.2 17.72 20.63C20.86 20.05 21.58 19.34 22.15 16.2Z" fill={`url(#${gradientId})`} opacity=".85" />
      <path d="M5.25 15.8C5.62 17.84 6.08 18.3 8.12 18.67C6.08 19.04 5.62 19.5 5.25 21.54C4.88 19.5 4.42 19.04 2.38 18.67C4.42 18.3 4.88 17.84 5.25 15.8Z" fill={`url(#${gradientId})`} opacity=".7" />
      <defs>
        <linearGradient id={gradientId} x1="4" y1="3" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EA7096" />
          <stop offset=".51" stopColor="#F09AB1" />
          <stop offset="1" stopColor="#AA95DA" />
        </linearGradient>
      </defs>
    </svg>
  );
}
