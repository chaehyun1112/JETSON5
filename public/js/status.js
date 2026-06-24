function readChartData(id) {
    const element = document.getElementById(id);

    if (!element) {
        return null;
    }

    return {
        element,
        data: JSON.parse(element.dataset.chart || "{}")
    };
}

function pointsToPath(points) {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function renderWeightChart() {
    const chart = readChartData("weightLineChart");

    if (!chart) {
        return;
    }

    const values = chart.data.values;
    const labels = chart.data.labels;
    const min = 26;
    const max = 31;
    const width = 760;
    const height = 230;
    const padding = { top: 14, right: 18, bottom: 34, left: 46 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = values.map((value, index) => ({
        x: padding.left + (innerWidth / (values.length - 1)) * index,
        y: padding.top + innerHeight - ((value - min) / (max - min)) * innerHeight
    }));

    chart.element.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="복약량 실시간 변화">
            ${[31, 30, 29, 28, 27, 26].map((tick) => {
                const y = padding.top + innerHeight - ((tick - min) / (max - min)) * innerHeight;
                return `<g><line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" /><text x="8" y="${y + 4}">${tick} g</text></g>`;
            }).join("")}
            <path class="weight-area" d="${pointsToPath(points)} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z"></path>
            <path class="weight-line" d="${pointsToPath(points)}"></path>
            ${labels.map((label, index) => {
                const x = padding.left + (innerWidth / (labels.length - 1)) * index;
                return `<text class="axis-label" x="${x}" y="${height - 9}" text-anchor="middle">${label}</text>`;
            }).join("")}
        </svg>
    `;
}

function renderWeeklyChart() {
    const chart = readChartData("weeklyLineChart");

    if (!chart) {
        return;
    }

    const items = chart.data;
    const width = 620;
    const height = 210;
    const padding = { top: 24, right: 26, bottom: 42, left: 26 };
    const min = 27;
    const max = 31;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = items.map((item, index) => ({
        x: padding.left + (innerWidth / (items.length - 1)) * index,
        y: padding.top + innerHeight - ((item.value - min) / (max - min)) * innerHeight,
        day: item.day,
        value: item.value
    }));

    chart.element.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="주간 평균 복약량 추이">
            <path class="weekly-area" d="${pointsToPath(points)} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z"></path>
            <path class="weekly-line" d="${pointsToPath(points)}"></path>
            ${points.map((point) => `
                <circle cx="${point.x}" cy="${point.y}" r="7"></circle>
                <text class="value-label" x="${point.x}" y="${point.y - 18}" text-anchor="middle">${point.value}</text>
                <text class="day-label" x="${point.x}" y="${height - 12}" text-anchor="middle">${point.day}</text>
            `).join("")}
        </svg>
    `;
}

renderWeightChart();
renderWeeklyChart();
