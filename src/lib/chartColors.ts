import { useTheme } from './theme';

export interface ChartPalette {
  accent: string;
  accent2: string;
  teal: string;
  amber: string;
  rose: string;
  grid: string;
  line: string;
  font: string;
}

const dark: ChartPalette = {
  accent: '#4f7cff',
  accent2: '#6f93ff',
  teal: '#22c8b0',
  amber: '#f2a93c',
  rose: '#f2495c',
  grid: '#1c2438',
  line: '#2a3350',
  font: '#b6c0e2',
};

const light: ChartPalette = {
  accent: '#3b63e0',
  accent2: '#5678e8',
  teal: '#0f8a74',
  amber: '#c07615',
  rose: '#c92f47',
  grid: '#e2e5f0',
  line: '#c7cce3',
  font: '#4b5375',
};

export function useChartColors(): ChartPalette {
  const { theme } = useTheme();
  return theme === 'light' ? light : dark;
}
