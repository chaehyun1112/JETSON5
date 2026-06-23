const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
    const data = {
        resident: {
            name: "홍춘순 어르신",
            age: 74,
            careLevel: "관리 4구역",
            status: "정상"
        },
        lastUpdated: "2025년 6월 12일 목요일 · 오후 2:35",
        summary: {
            device: {
                label: "센서 연결 상태",
                value: "정상",
                sub: "마지막 업데이트 14:25:13"
            },
            remaining: {
                label: "잔여량 추정",
                value: "약 17일분",
                sub: "정상"
            }
        },
        weightChart: {
            labels: ["03:09", "03:15", "03:21", "03:27", "03:33", "03:39", "03:45"],
            values: [28.9, 28.8, 27.2, 27.1, 27.1, 27.1, 27.2]
        },
        doseAmounts: [
            { label: "아침 (2t)", value: 85, detail: "약 17일분 보유" },
            { label: "점심 (2t)", value: 42, detail: "약 8일 보유" },
            { label: "저녁 (2t)", value: 76, detail: "약 15일 보유" }
        ],
        weeklyTrend: [
            { day: "월", value: 30 },
            { day: "화", value: 29 },
            { day: "수", value: 29 },
            { day: "목", value: 28 },
            { day: "금", value: 28 },
            { day: "토", value: 28 },
            { day: "일", value: 28 }
        ],
        logs: [
            { date: "2025-05-20", time: "08:05", state: "열림", result: "복용 완료", tone: "success" },
            { date: "2025-05-19", time: "08:03", state: "열림", result: "복용 완료", tone: "success" },
            { date: "2025-05-18", time: "-", state: "닫힘", result: "미복용", tone: "danger" },
            { date: "2025-05-17", time: "08:02", state: "열림", result: "복용 완료", tone: "success" },
            { date: "2025-05-16", time: "08:01", state: "열림", result: "복용 완료", tone: "success" },
            { date: "2025-05-15", time: "08:04", state: "열림", result: "이중 복용 의심", tone: "warning" },
            { date: "2025-05-14", time: "08:06", state: "열림", result: "복용 완료", tone: "success" }
        ],
        events: [
            {
                title: "이중 복용 의심",
                date: "2025-05-15 08:04",
                detail: "1회 기준(1.6g)의 2배 감소가 감지되어 보호자에게 알림을 전송했습니다.",
                tone: "warning"
            },
            {
                title: "복약량 부족 예측",
                date: "금요일 (2t)",
                detail: "현재 용량 42%, 약 8일 후 소진 예상. 처방전 준비를 권장합니다.",
                tone: "neutral"
            },
            {
                title: "정상 복용 확인",
                date: "2025-05-20 08:05",
                detail: "아침 시간대 대비 1분 이내 복용. 무게 -1.6g 감소.",
                tone: "success"
            },
            {
                title: "미복용 감지",
                date: "2025-05-18 종일",
                detail: "무게 변화가 없어 보호자에게 SMS 전송을 완료했습니다.",
                tone: "warning"
            }
        ]
    };

    res.render("status", { data });
});

module.exports = router;
