import Plot from 'react-plotly.js';
import type { Data, Layout, Config } from 'plotly.js';

const FONT = { family: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#b6c0e2' };

export const plotColors = {
  accent: '#4f7cff',
  accent2: '#6f93ff',
  teal: '#22c8b0',
  amber: '#f2a93c',
  rose: '#f2495c',
  grid: '#1c2438',
  line: '#2a3350',
};

interface DarkPlotProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  style?: React.CSSProperties;
}

export default function DarkPlot({ data, layout, config, className, style }: DarkPlotProps) {
  const mergedLayout: Partial<Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: FONT,
    margin: { l: 50, r: 20, t: 30, b: 40 },
    legend: { bgcolor: 'transparent', font: FONT },
    xaxis: { gridcolor: plotColors.grid, zerolinecolor: plotColors.line, linecolor: plotColors.line, ...(layout?.xaxis ?? {}) },
    yaxis: { gridcolor: plotColors.grid, zerolinecolor: plotColors.line, linecolor: plotColors.line, ...(layout?.yaxis ?? {}) },
    ...layout,
  };

  return (
    <Plot
      data={data}
      layout={mergedLayout}
      config={{ displaylogo: false, responsive: true, ...config }}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      useResizeHandler
    />
  );
}
