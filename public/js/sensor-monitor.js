(function () {
    const selector = "[data-sensor-key]";
    const sensorCards = Array.from(document.querySelectorAll(selector));

    function readSensorCard(card) {
        const key = card.dataset.sensorKey;
        const label = card.querySelector("[data-sensor-label]")?.textContent.trim() || "";
        const value = card.querySelector("[data-sensor-value]")?.textContent.trim() || "";
        const status = card.querySelector("[data-sensor-status]")?.textContent.trim() || "";

        return { key, label, value, status };
    }

    function collectSensorValues() {
        return sensorCards.reduce((values, card) => {
            const sensor = readSensorCard(card);

            values[sensor.key] = {
                label: sensor.label,
                value: sensor.value,
                status: sensor.status
            };

            return values;
        }, {});
    }

    function saveAndLogSensorValues(reason) {
        window.sensorValues = collectSensorValues();
        console.log(`[sensor-monitor] ${reason}`, window.sensorValues);
    }

    if (sensorCards.length === 0) {
        window.sensorValues = {};
        console.warn("[sensor-monitor] 감지할 센서 요소가 없습니다.");
        return;
    }

    saveAndLogSensorValues("초기 값 저장");

    sensorCards.forEach((card) => {
        const observer = new MutationObserver(() => {
            const sensor = readSensorCard(card);
            saveAndLogSensorValues(`${sensor.label || sensor.key} 값 변경 감지`);
        });

        observer.observe(card, {
            childList: true,
            characterData: true,
            subtree: true
        });
    });
})();
