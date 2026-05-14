const RateChart = {
  chart: null,
  currentPair: null,
  currentDays: 30,

  // Load and render historical data for a currency pair
  async load(from, to, days) {
    if (!from || !to) {
      UI.toast('Invalid currency pair', 'error');
      return;
    }

    this.currentPair = { from, to };
    this.currentDays = days || this.currentDays;

    const chartPlaceholder = document.getElementById('chart-placeholder');
    const chartLoading = document.getElementById('chart-loading');
    const chartTitle = document.getElementById('chart-title');
    const chartSubtitle = document.getElementById('chart-subtitle');

    // Show loading
    chartPlaceholder.classList.add('hidden');
    chartLoading.classList.remove('hidden');

    try {
      const result = await API.getHistory(from, to, this.currentDays);

      if (!result.data || !result.data.rates) {
        throw new Error('Invalid data received from server');
      }

      const ratesData = result.data;

      // Parse rates from Frankfurter time-series format
      const dates = Object.keys(ratesData.rates || {}).sort();
      const values = dates.map(d => ratesData.rates[d][to]);

      // Validate data
      if (dates.length === 0 || !values.some(v => v !== undefined && v !== null)) {
        throw new Error('No historical data available for this pair');
      }

      // Update title
      chartTitle.textContent = `${from} → ${to}`;
      chartSubtitle.textContent = `${this.currentDays}-day trend • ${dates.length} data points`;

      // Render chart
      this.render(dates, values, from, to);

      chartLoading.classList.add('hidden');

    } catch (err) {
      chartLoading.classList.add('hidden');
      chartPlaceholder.classList.remove('hidden');
      console.error('Chart load error:', err);
      UI.toast(`Chart error: ${err.message}`, 'error');
    }
  },

  // Render or update the Chart.js line chart
  render(labels, data, from, to) {
    const ctx = document.getElementById('rate-chart').getContext('2d');

    // Destroy existing chart
    if (this.chart) {
      this.chart.destroy();
    }

    // Format labels to shorter date strings
    const formattedLabels = labels.map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Calculate trend
    const first = data[0];
    const last = data[data.length - 1];
    const isUp = last >= first;
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const bgColor = isUp ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [{
          label: `${from}/${to}`,
          data: data,
          borderColor: lineColor,
          backgroundColor: bgColor,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: data.length > 60 ? 0 : 3,
          pointHoverRadius: 6,
          pointBackgroundColor: lineColor,
          pointBorderColor: '#0a0e17',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: lineColor,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(10, 14, 23, 0.95)',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(212, 168, 67, 0.2)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleFont: { family: 'Inter', weight: '600' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: function (context) {
                return `Rate: ${context.parsed.y.toFixed(4)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
            ticks: {
              color: '#64748b', font: { family: 'Inter', size: 11 },
              maxTicksLimit: 8, maxRotation: 0
            }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
            ticks: {
              color: '#64748b', font: { family: 'Inter', size: 11 },
              callback: function (val) { return val.toFixed(4); }
            }
          }
        }
      }
    });
  },

  // Change the time period and reload
  async changePeriod(days) {
    if (!this.currentPair) return;
    this.currentDays = days;

    // Update active button
    document.querySelectorAll('.chart-period').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.days) === days);
    });

    await this.load(this.currentPair.from, this.currentPair.to, days);
  }
};
