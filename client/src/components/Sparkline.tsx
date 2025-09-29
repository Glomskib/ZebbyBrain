import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({ 
  data, 
  width = 80, 
  height = 24, 
  color = "currentColor",
  className = ""
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length === 0) return '';
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;
    
    if (range === 0) {
      // Flat line
      const y = height / 2;
      return `M0,${y} L${width},${y}`;
    }
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    });
    
    return `M${points.join(' L')}`;
  }, [data, width, height]);

  if (data.length === 0) {
    return (
      <div 
        className={`flex items-center justify-center text-xs text-muted-foreground ${className}`}
        style={{ width, height }}
      >
        No data
      </div>
    );
  }

  return (
    <svg 
      width={width} 
      height={height} 
      className={`${className}`}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function generateSparklineDataUrl(data: number[], width = 80, height = 24): string {
  if (data.length === 0) return '';
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  
  if (range === 0) {
    const y = height / 2;
    const path = `M0,${y} L${width},${y}`;
    return `data:image/svg+xml,${encodeURIComponent(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>`)}`;
  }
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  
  const path = `M${points.join(' L')}`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>`)}`;
}