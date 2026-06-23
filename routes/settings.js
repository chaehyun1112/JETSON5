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
        version: "1.0.0",
        items: [
            {
                title: "계정 정보",
                description: "이름, 아이디, 비밀번호 변경",
                icon: "👤",
                tone: "blue"
            },
            {
                title: "알림 설정",
                description: "복약 알림, 미복용 감지 알림 설정",
                icon: "🔔",
                tone: "yellow"
            },
            {
                title: "디스플레이",
                description: "언어, 테마 등",
                icon: "📱",
                tone: "green"
            },
            {
                title: "개인정보 관리",
                description: "개인정보 처리방침, 데이터 삭제",
                icon: "🔒",
                tone: "pink"
            },
            {
                title: "도움말",
                description: "사용 가이드, 자주 묻는 질문",
                icon: "?",
                tone: "magenta"
            },
            {
                title: "로그아웃",
                description: "현재 계정에서 로그아웃",
                icon: "🚪",
                tone: "brown",
                danger: true
            }
        ]
    };

    res.render("settings", { data });
});

module.exports = router;
