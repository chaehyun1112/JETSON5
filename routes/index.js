const express = require("express");
const router = express.Router();

// 로그인 체크 미들웨어
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}
 
// 비로그인 메인
router.get('/', (req, res) => {
  res.render('index', {
    title: '복약안심서비스',
    stats: { total: 12, completed: 9, warning: 2 },
    patients: [
      { name: '김순자', status: 'ok',   label: '아침 복약 완료' },
      { name: '이철수', status: 'ok',   label: '아침 복약 완료' },
      { name: '박영희', status: 'warn', label: '복약 지연 중'   },
      { name: '최민수', status: 'late', label: '미복약 경보'    },
    ],
  });
});
 
// 서비스 소개
router.get('/user/user_service/about', (req, res) => {
  res.render('user/user_service/about', { title: '서비스 소개 — 복약안심서비스' });
});
 
// 대시보드 — 약통 미등록 시 안내 페이지로 분기
router.get('/user/user_dashboard/main_dashboard', requireLogin, (req, res) => {
  // 세션에 pillboxId가 없으면 미등록 안내 페이지
  if (!req.session.user.pillboxId) {
    return res.render('user/user_service/no-pillbox', {
      title: '약통 미등록 — 복약안심서비스',
    });
  }
  res.render('user/user_dashboard/main_dashboard', {
    title: '대시보드 — 복약안심서비스',
    stats: { total: 12, completed: 9, warning: 2, rate: 75 },
    patients: [
      { name: '김순자', age: 78, status: 'ok',   time: '08:12', drug: '혈압약, 당뇨약' },
      { name: '이철수', age: 82, status: 'ok',   time: '08:34', drug: '고지혈증약'      },
      { name: '박영희', age: 75, status: 'warn', time: '—',     drug: '골다공증약'      },
      { name: '최민수', age: 88, status: 'late', time: '—',     drug: '심장약, 혈압약'  },
    ],
    alerts: [
      { type: 'late', message: '최민수 님이 오전 복약을 하지 않았습니다.', time: '09:01' },
      { type: 'warn', message: '박영희 님 복약이 30분 지연되고 있습니다.',  time: '08:50' },
      { type: 'ok',   message: '이철수 님 아침 복약 완료.',                 time: '08:34' },
      { type: 'ok',   message: '김순자 님 아침 복약 완료.',                 time: '08:12' },
    ],
  });
});
 
// 약통 등록 페이지 (임시 — 실제 DB 연동 시 확장)
router.get('/user/user_service/register-pillbox', requireLogin, (req, res) => {
  res.render('user/user_service/register-pillbox', { title: '약통 등록 — 복약안심서비스', error: null });
});
 
router.post('/user/user_service/register-pillbox', requireLogin, (req, res) => {
  const { pillboxId } = req.body;
  if (!pillboxId || pillboxId.trim() === '') {
    return res.render('user/user_service/register-pillbox', {
      title: '약통 등록 — 복약안심서비스',
      error: '약통 번호를 입력해주세요.',
    });
  }
  // 세션에 저장 (실제 서비스에서는 DB에 저장)
  req.session.user.pillboxId = pillboxId.trim();
  res.redirect('/user/user_dashboard/main_dashboard');
});
 
// 로그인 GET
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/user/user_service/about');
  res.render('login/login', { title: '로그인 — 복약안심서비스', error: null });
});
 
// 로그인 POST
router.post('/login', (req, res) => {
  const { userId, password } = req.body;
  if (userId === 'admin' && password === '1234') {
    req.session.user = { id: userId, name: '김성훈', role: '보호자', pillboxId: null };
    return res.redirect('/user/user_service/about');
  }
  res.render('login/login', {
    title: '로그인 — 복약안심서비스',
    error: '아이디 또는 비밀번호가 올바르지 않습니다.',
  });
});
 
// 로그아웃
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});


router.get('/user/user_service/medicine_buy', (req, res) => {
  res.render('user/user_service/medicine_buy', { title: '약통 구매 — 복약안심서비스' });
});

// POST — 구매하기 버튼 클릭 시 완료 페이지로
router.post('/user/user_service/medicine_buy', (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const pillboxCode = `PB-${rand(4)}-${rand(4)}-${rand(4)}`;
  res.render('user/user_service/medicine_buy_complete', {
    title: '구매 완료 — 복약안심서비스',
    pillboxCode,
  });
});

router.get("/admin/members", (req, res) => {
  const members = [
    {
      id: "parent01",
      name: "김보호",
      type: "P",
      email: "parent01@example.com",
      contact: "010-1111-2222",
      joinedAt: "2026-06-22",
      address: "광주광역시",
      memo: "시니어 회원 이민수 보호자",
    },
    {
      id: "senior01",
      name: "이민수",
      type: "S",
      email: "senior01@example.com",
      contact: "010-3333-4444",
      joinedAt: "2026-06-21",
      address: "광주광역시",
      memo: "복약 알림 사용 중",
    },
    {
      id: "senior02",
      name: "박영희",
      type: "S",
      email: "senior02@example.com",
      contact: "010-5555-6666",
      joinedAt: "2026-06-20",
      address: "전라남도 나주시",
      memo: "약상자 연결 대기",
    },
  ];

  res.render("admin/members", {
    title: "회원관리",
    pageTitle: "회원관리",
    members,
  });
});


router.get("/admin/medicine_boxes", (req, res) => {
  const medicineBoxes = [
    {
      id: "BOX-001",
      owner: "이민수",
      status: "ON",
      weight: "128g",
      isOpen: false,
      lcdTime: "2026-06-22 09:20",
      buzzer: true,
      led: true,
      lastUpdated: "2026-06-22 09:25",
    },
    {
      id: "BOX-002",
      owner: "박영희",
      status: "OFF",
      weight: "84g",
      isOpen: false,
      lcdTime: "2026-06-22 08:10",
      buzzer: false,
      led: false,
      lastUpdated: "2026-06-22 08:15",
    },
    {
      id: "BOX-003",
      owner: "정순자",
      status: "ON",
      weight: "42g",
      isOpen: true,
      lcdTime: "2026-06-22 10:02",
      buzzer: false,
      led: true,
      lastUpdated: "2026-06-22 10:03",
    },
  ];

  res.render("admin/medicine_boxes", {
    title: "약상자 관리",
    pageTitle: "약상자 관리",
    medicineBoxes,
  });
});


router.get("/admin/messages", (req, res) => {
  const messages = [
    {
      id: 1,
      type: "문의",
      title: "약상자 알림 시간이 변경되지 않습니다.",
      sender: "김보호",
      memberId: "parent01",
      status: "대기",
      createdAt: "2026-06-22 09:12",
      content:
        "보호자 앱에서 복약 알림 시간을 변경했는데 약상자에 반영되지 않습니다. 확인 부탁드립니다.",
    },
    {
      id: 2,
      type: "이상사항",
      title: "BOX-003 약상자 개폐 감지 상태가 오래 유지됩니다.",
      sender: "시스템",
      memberId: "BOX-003",
      status: "확인 필요",
      createdAt: "2026-06-22 10:03",
      content:
        "BOX-003 약상자가 10분 이상 열림 상태로 유지되고 있습니다. 사용자 확인이 필요합니다.",
    },
    {
      id: 3,
      type: "문의",
      title: "회원정보 연락처를 수정하고 싶습니다.",
      sender: "박영희",
      memberId: "senior02",
      status: "완료",
      createdAt: "2026-06-21 16:40",
      content:
        "회원가입할 때 입력한 연락처가 변경되었습니다. 관리자 페이지에서 수정 가능한지 문의드립니다.",
    },
    {
      id: 4,
      type: "이상사항",
      title: "부저 알람이 작동하지 않습니다.",
      sender: "이민수",
      memberId: "senior01",
      status: "대기",
      createdAt: "2026-06-21 08:30",
      content:
        "복약 시간이 되었는데 부저 소리가 나지 않았습니다. LED는 켜졌지만 알림음은 들리지 않았습니다.",
    },
  ];

  res.render("admin/messages", {
    title: "알림메시지",
    pageTitle: "알림메시지",
    messages,
  });
});



router.get("/admin/members_update/", (req, res) => {
  const memberId = req.params.id;

  const member = {
    id: memberId,
    type: "S",
    name: "이민수",
    email: "abc@naver.com",
    contact: "010-1234-5678",
    address: "광주광역시 북구 첨단과기로 123",
    joinedAt: "2026-06-22",
  };

  res.render("admin/members_update", {
    title: "회원정보 수정",
    pageTitle: "회원정보 수정",
    member,
  });
});

router.get('/', (req, res) => {
  res.render('index', {
    title: '복약안심서비스',
    stats: {
      total: 12,
      completed: 9,
      warning: 2,
    },
    patients: [
      { name: '김순자', status: 'ok',   label: '아침 복약 완료' },
      { name: '이철수', status: 'ok',   label: '아침 복약 완료' },
      { name: '박영희', status: 'warn', label: '복약 지연 중'   },
      { name: '최민수', status: 'late', label: '미복약 경보'    },
    ],
  });
});

router.get('/login', (req, res) => {
  res.render('login', { title: '로그인 — 복약안심서비스' });
});


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


router.get("/dashboard_user", (req, res) => {
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

    res.render("dashboard_user", { data });
});

router.get("/records", (req, res) => {
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


router.get("/settings", (req, res) => {
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


router.get("/status", (req, res) => {
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

router.get("/alerts", (req, res) => {
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