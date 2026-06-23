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
        guardian: {
            name: "김태현",
            relation: "보호자",
            phone: "010-1234-5678"
        },
        history: [
            {
                sentAt: "2025-05-21 08:05",
                type: "미복용 감지",
                tone: "danger",
                message: "어제 시간(06:00)을 5분 경과하였으나 약통이 열리지 않았습니다."
            },
            {
                sentAt: "2025-05-20 08:05",
                type: "복용 완료",
                tone: "success",
                message: "약통이 열려 복용이 완료되었습니다."
            },
            {
                sentAt: "2025-05-19 08:03",
                type: "복용 완료",
                tone: "success",
                message: "약통이 열려 복용이 완료되었습니다."
            }
        ]
    };

    res.render("alerts", { data });
});

module.exports = router;
