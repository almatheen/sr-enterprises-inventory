
'use client';

import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type LineChartProps = {
  labels: string[];
  sales: number[];
  profit?: number[];
  height: number;
};

export function LineChart({
  labels,
  sales,
  profit,
  height,
}: LineChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const datasets = [
      {
        label: 'Sales (₹)',
        data: sales,
        borderColor: '#10a37f',
        backgroundColor: 'rgba(16, 163, 127, 0.10)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#10a37f',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.35,
      },
    ];

    if (profit) {
      datasets.push({
        label: 'Gross Profit (₹)',
        data: profit,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.06)',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#3b82f6',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        fill: false,
        tension: 0.35,
      });
    }

    const chart = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: Boolean(profit),
            position: 'top',
            align: 'end',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 7,
              padding: 16,
            },
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#17212b',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            padding: 12,
            cornerRadius: 8,
            displayColors: true,
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ₹${Number(
                  context.parsed.y
                ).toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}`,
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            border: {
              display: false,
            },
            ticks: {
              maxTicksLimit: 8,
              maxRotation: 0,
              autoSkip: true,
            },
          },
          y: {
            beginAtZero: true,
            border: {
              display: false,
              dash: [4, 4],
            },
            grid: {
              color: 'rgba(128, 128, 128, 0.12)',
            },
            ticks: {
              maxTicksLimit: 5,
              callback: (value) =>
                `₹${Number(value).toLocaleString('en-IN')}`,
            },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [labels, sales, profit, height]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Sales and profit line chart"
      />
    </div>
  );
}

export function DoughnutChart({
  labels,
  data,
}: {
  labels: string[];
  data: number[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const chart = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: [
              '#0f2747',
              '#10a37f',
              '#3b82f6',
              '#f5a524',
              '#e5484d',
              '#8b5cf6',
            ],
            borderWidth: 0,
            hoverOffset: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    });

    return () => chart.destroy();
  }, [labels, data]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 260 }}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Category performance chart"
      />
    </div>
  );
}
