const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
    const data = {
        resident: {
            name: "홍옥순 어르신",
            age: 74,
            careLevel: "관리 4구역",
            status: "정상"
        },
        lastUpdated: "2025년 6월 12일 목요일 · 오후 2:35",
        alert: {
            title: "저녁 복약 시간이 2시간 후입니다",
            message: "오후 5시 저녁 약 복용 예정입니다. 고지혈증약, 당뇨약, 칼슘약을 어르신 기기 정상 작동 중."
        },
        metrics: [
            { label: "오늘 복약률", value: "66", suffix: "%", note: "아침 · 점심 완료", icon: "check", tone: "success" },
            { label: "이번주 평균 복약률", value: "82", suffix: "%", note: "지난주 대비 +8%", icon: "calendar", tone: "warning" },
            { label: "연속 복약 일수", value: "5", suffix: "일", note: "최고기록 갱신 중", icon: "flame", tone: "success" },
            { label: "이번달 누락 횟수", value: "3", suffix: "회", note: "지난달 7회 -> 개선됨", icon: "alert", tone: "danger" }
        ],
        todaySchedule: [
            { time: "08:00", period: "아침", medicines: ["혈압약 (암로디핀)", "고지혈증약 (아토르바)"], status: "복약 완료", statusTime: "08:07", done: true },
            { time: "12:00", period: "점심", medicines: ["당뇨약 (메트포르민)"], status: "복약 완료", statusTime: "12:14", done: true },
            { time: "17:00", period: "저녁", medicines: ["혈압약 (암로디핀)", "고지혈증약 (아토르바)", "당뇨약 (메트포르민)"], status: "복약 예정", statusTime: "2h 후", done: false }
        ],
        weekly: [
            { day: "일", states: ["success", "success", "success"], rate: "100%" },
            { day: "월", states: ["success", "missed", "success"], rate: "67%" },
            { day: "화", states: ["success", "success", "success"], rate: "100%" },
            { day: "수", states: ["success", "success", "pending"], rate: "67%" },
            { day: "목", states: ["empty", "empty", "empty"], rate: "-" },
            { day: "금", states: ["empty", "empty", "empty"], rate: "-" },
            { day: "토", states: ["empty", "empty", "empty"], rate: "-" }
        ],
        sensors: [
            { key: "weight", label: "무게 센서", value: "318.4g", sub: "정상 범위", icon: "device" },
            { key: "temperature", label: "온도", value: "24.8°C", sub: "보관 적정", icon: "temperature" },
            { key: "humidity", label: "습도", value: "42%", sub: "보관 적정", icon: "humidity" },
            { key: "door", label: "문 열림 상태", value: "닫힘", sub: "정상", icon: "door" }
        ],
        latestCheck: {
            title: "오늘 12:14 · 점심 복약",
            detail: "무게 변화 -3.2g 감지 -> 복약 확인"
        },
        alerts: [
            { title: "미복약 감지 -- 화요일 점심", time: "화 12:31", tone: "danger" },
            { title: "복약 완료 확인 -- 오늘 점심", time: "오늘 12:14", tone: "success" },
            { title: "복약 완료 확인 -- 오늘 아침", time: "오늘 08:07", tone: "success" },
            { title: "기기 연결 재개", time: "어제 22:05", tone: "neutral" }
        ],
        chart: {
            labels: ["5/14", "5/15", "5/16", "5/17", "5/18", "5/19", "5/20", "5/21", "5/22", "5/23", "5/24", "5/25", "5/26", "5/27", "5/28", "5/29", "5/30", "5/31", "6/1", "6/2", "6/3", "6/4", "6/5", "6/6", "6/7", "6/8", "6/9", "6/10", "6/11"],
            values: [66, 100, 100, 66, 66, 100, 100, 66, 100, 66, 100, 100, 66, 100, 100, 66, 100, 100, 100, 100, 66, 100, 100, 100, 66, 100, 100, 66, 66]
        }
    };

    res.render("dashboard", { data });
});

module.exports = router;
