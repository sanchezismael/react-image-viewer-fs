import React from 'react';

interface DonutChartProps {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
}

const DonutChart: React.FC<DonutChartProps> = ({ progress, size = 100, strokeWidth = 8 }) => {
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  
  // Ensure progress is a valid number, default to 0 if NaN
  const validProgress = isNaN(progress) ? 0 : progress;
  const offset = circumference - (validProgress * circumference);

  const percentage = Math.round(validProgress * 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke="#4a5568" // gray-600
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke="#4f46e5" // indigo-600
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 0.3s ease-in-out' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy=".3em"
        fontSize={size * 0.22}
        fontWeight="bold"
        fill="white"
      >
        {`${percentage}%`}
      </text>
    </svg>
  );
};

export default DonutChart;
