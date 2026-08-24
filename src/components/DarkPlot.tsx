import Plot from 'react-plotly.js';
import type { Data, Layout, Config } from 'plotly.js';
import { useChartColors } from '../lib/chartColors';

interface DarkPlotProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  style?: React.CSSProperties;
}

export default function DarkPlot({ data, layout, config, className, style }: DarkPlotProps) {
  const colors = useChartColors();
  const font = { family: 'Inter, ui-sans-serif, system-ui, sans-serif', color: colors.font };

  const mergedLayout: Partial<Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font,
    margin: { l: 50, r: 20, t: 30, b: 40 },
    legend: { bgcolor: 'transparent', font },
    xaxis: { gridcolor: colors.grid, zerolinecolor: colors.line, linecolor: colors.line, ...(layout?.xaxis ?? {}) },
    yaxis: { gridcolor: colors.grid, zerolinecolor: colors.line, linecolor: colors.line, ...(layout?.yaxis ?? {}) },
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
