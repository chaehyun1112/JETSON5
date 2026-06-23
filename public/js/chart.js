const chartDataElement = document.getElementById("dashboardChartData");
const chartData = chartDataElement
    ? JSON.parse(chartDataElement.textContent)
    : { labels: [], values: [] };
const chart = document.getElementById("pillChart");

if (chart) {
    const max = 110;
    const ticks = document.createElement("div");
    ticks.className = "chart-ticks";
    ticks.innerHTML = "<span>110%</span><span>99%</span><span>66%</span><span>33%</span><span>0%</span>";

    const bars = document.createElement("div");
    bars.className = "chart-bars";

    chartData.values.forEach((value, index) => {
        const item = document.createElement("div");
        item.className = "chart-item";

        const bar = document.createElement("span");
        bar.className = value >= 90 ? "chart-bar success" : "chart-bar warning";
        bar.style.height = `${Math.max(8, (value / max) * 100)}%`;
        bar.title = `${chartData.labels[index]} 복약률 ${value}%`;

        const label = document.createElement("small");
        label.textContent = chartData.labels[index];

        item.append(bar, label);
        bars.appendChild(item);
    });

    chart.append(ticks, bars);
}
