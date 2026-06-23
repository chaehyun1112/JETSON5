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
        range: "2025-05-14 ~ 2025-05-20",
        records: [
            { date: "2025-05-20 (화)", plannedTime: "08:00", actualTime: "08:05", result: "복용 완료", resultTone: "success", bottleState: "열림", bottleTone: "open" },
            { date: "2025-05-19 (월)", plannedTime: "08:00", actualTime: "08:03", result: "복용 완료", resultTone: "success", bottleState: "열림", bottleTone: "open" },
            { date: "2025-05-18 (일)", plannedTime: "08:00", actualTime: "-", result: "미복용", resultTone: "danger", bottleState: "닫힘", bottleTone: "closed" },
            { date: "2025-05-17 (토)", plannedTime: "08:00", actualTime: "08:02", result: "복용 완료", resultTone: "success", bottleState: "열림", bottleTone: "open" },
            { date: "2025-05-16 (금)", plannedTime: "08:00", actualTime: "08:01", result: "복용 완료", resultTone: "success", bottleState: "열림", bottleTone: "open" },
            { date: "2025-05-15 (목)", plannedTime: "08:00", actualTime: "08:04", result: "복용 완료", resultTone: "success", bottleState: "열림", bottleTone: "open" },
            { date: "2025-05-14 (수)", plannedTime: "08:00", actualTime: "08:06", result: "복용 완료", resultTone: "success", bottleState: "열림", bottleTone: "open" }
        ],
        pagination: {
            current: 1,
            pages: [1, 2, 3]
        }
    };

    res.render("records", { data });
});

module.exports = router;
