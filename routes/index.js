const express = require('express');
const bcrypt = require("bcrypt");
const router = express.Router();
const conn = require('../config/db');
const mysql = require('mysql2');

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
// 약 스케줄 get
router.get("/user/user_service/schedule_register", (req, res) => {

    if(!req.session.user){
        return res.redirect("/");
    }

    const sql = `
    SELECT *
    FROM TB_SENIOR
    WHERE MEM_ID = ?
    `;

    conn.query(
        sql,
        [req.session.user.id],
        (err, rows) => {

            if(err){
                console.log(err);
                return;
            }

            res.render(
                "user/user_service/schedule_register",
                { seniors : rows }
            );
        }
    );
});




// 약 스케줄 post
router.post("/user/user_service/schedule_register", (req, res) => {

    const {
        seniorId,
        takingDate,
        pillboxOrder,
        takingType,
        takingTime
    } = req.body;

    const sql = `
    INSERT INTO TB_SCHEDULE
    (
        SENIOR_ID,
        TAKING_DATE,
        PILLBOX_ORDER,
        TAKING_TYPE,
        TAKING_TIME,
        TAKING_YN
    )
    VALUES
    (?, ?, ?, ?, ?, 'N')
    `;

    conn.query(
        sql,
        [
            seniorId,
            takingDate,
            pillboxOrder,
            takingType,
            takingTime
        ],
        (err, result) => {

            if(err){
                console.log(err);

                return res.send(
                    "<script>alert('등록 실패');history.back();</script>"
                );
            }

            res.send(
                "<script>alert('복약 스케줄 등록 완료');location.href='/user/user_dashboard/main_dashboard';</script>"
            );

        }
    );
});
// 약통 등록 페이지 (임시 — 실제 DB 연동 시 확장)
router.get('/user/user_service/register-pillbox', requireLogin, (req, res) => {
    if(!req.session.user){
        return res.redirect("/");
    }

    const sql = `
    SELECT *
    FROM TB_SENIOR
    WHERE MEM_ID = ?
    `;

    conn.query(
        sql,
        [req.session.user.id],
        (err, rows) => {

            if(err){
                console.log(err);
                return;
            }

            res.render(
                "user/user_service/register-pillbox", {
            title: "약통 등록",
            user: req.session.user,
            error: null,
            seniors: rows
          });
        }
    );});
 
router.post('/user/user_service/register-pillbox', requireLogin, (req, res) => {
    const {
        seniorId,
        pillboxId
    } = req.body;

    const sql = `
    UPDATE TB_SENIOR
    SET PILLBOX_NUM = ?
    WHERE SENIOR_ID = ?
    `;

    conn.query(
        sql,
        [pillboxId, seniorId],
        (err, result) => {

            if(err){
                console.log(err);

                return res.send(
                    "<script>alert('약통 등록 실패');history.back();</script>"
                );
            }
            req.session.user.pillboxId = pillboxId;

            res.send(
                "<script>alert('약통 등록 완료');location.href='/user/user_service/schedule_register';</script>"
            );
        }
    );
});
 
router.get('/join', (req, res) => {
    res.render('login/join');
});

// 회원가입
router.post("/join", async (req, res) => {
    console.log(req.body);
    const {role, id, pw, name, email, addr, phone} = req.body;
    const hashedPw = await bcrypt.hash(pw, 10);

    const sql = "insert into TB_MEMBER (MEM_ID, MEM_PW, MEM_NAME, MEM_EMAIL, MEM_CONTACT, MEM_ADDR, MEM_ST) VALUES (?, ?, ?, ?, ?, ?, ?)";
    conn.query(sql, [id, hashedPw, name, email, phone, addr || null, role], (err, result) => {
        if (err) {
            res.send("<script>alert('회원가입에 실패했습니다.'); location.href='/join'</script>");
        } else {
            res.redirect("/login");

        }
    })
})

// 로그인 GET
router.get("/login", (req, res) => {

    if (req.session.user) {

        if (req.session.user.role === "A") {
            return res.redirect("/admin/admin_dashboard/admin");
        }

        return res.redirect("/user/user_/schedule_register");
    }

    res.render("login/login", {
        title: "로그인 - 복약안심서비스",
        error: null
    });
});
 
// 로그인 POST
router.post("/login", (req, res) => {

    const { userId, password  } = req.body;

    const sql = `
        SELECT *
        FROM TB_MEMBER
        WHERE MEM_ID = ?
    `;
    conn.query(sql, [userId], async (err, rows) => {

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }
        if(rows.length === 0){
            return res.send("<script>alert('아이디가 존재하지 않습니다.'); location.href='/login';</script>");
        }
        const user = rows[0];
        const isMatch = await bcrypt.compare(
            password,
            user.MEM_PW
        );
        if(isMatch){

            req.session.user = {
                id : user.MEM_ID,
                name: user.MEM_NAME,
                role : user.MEM_ST
            };
            if(user.MEM_ST === "P"){
                return res.redirect("/user/user_service/about");
            }
            if(user.MEM_ST === "S"){
                return res.redirect("/user/user_service/about");
            }
            if(user.MEM_ST === "A"){
                return res.redirect("/admin/admin_dashboard/admin");
            }
        } else {
            return res.send(
                "<script>alert('비밀번호가 일치하지 않습니다.'); location.href='/login';</script>"
            );
        }
    });
});


// 로그아웃
router.post("/logout", (req, res) => {
    req.session.destroy((err) => {

        if (err) {
            console.log(err);
            return res.redirect("/");
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
    });

});

// 로그인 안 한 사람 접근 차단
router.get("/admin/admin_dashboard/admin", (req, res) => {

    if(!req.session.user){
        return res.redirect("/");
    }

    res.render("admin/admin_dashboard/admin");
});

// 아이디 찾기
router.post("/findId", (req, res) => {

    const { name, email } = req.body;

    const sql = `
    SELECT MEM_ID
    FROM TB_MEMBER
    WHERE MEM_NAME = ?
    AND MEM_EMAIL = ?
    `;

    conn.query(
        sql,
        [name, email],
        (err, rows) => {

            if(err){
                console.log(err);
                return;
            }

            if(rows.length === 0){
                return res.send(
                    "<script>alert('일치하는 회원이 없습니다.');location.href='/findId';</script>"
                );
            }

            res.send(`
                <script>
                alert('회원님의 아이디는 ${rows[0].MEM_ID} 입니다.');
                location.href='/';
                </script>
            `);
        }
    );
});

// 비밀번호 재설정
router.post("/resetPw", async (req, res) => {

    const { id, email, newPw } = req.body;

    const sql =
    "SELECT * FROM TB_MEMBER WHERE MEM_ID=? AND MEM_EMAIL=?";

    conn.query(
        sql,
        [id, email],
        async (err, rows) => {

            if(rows.length === 0){

                return res.send(
                    "<script>alert('회원정보가 일치하지 않습니다.');location.href='/resetPw';</script>"
                );
            }

            const hashedPw =
            await bcrypt.hash(newPw, 10);

            const updateSql =
            "UPDATE TB_MEMBER SET MEM_PW=? WHERE MEM_ID=?";

            conn.query(
                updateSql,
                [hashedPw, id],
                (err, result) => {

                    if(err){
                        console.log(err);
                        return;
                    }

                    res.send(
                        "<script>alert('비밀번호가 변경되었습니다.');location.href='/';</script>"
                    );
                }
            );
        }
    );
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


router.get("/findId", (req, res) => {
    res.render("login/findId");
});

router.get("/resetPw", (req, res) => {
    res.render("login/resetPw");
});





function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

router.get('/user/user_info/protected', isLoggedIn, (req, res) => {

    const sql = `
    SELECT
        S.*,

        ROUND(
            IFNULL(
                (
                    SELECT
                        SUM(CASE WHEN SC.TAKING_YN='Y' THEN 1 ELSE 0 END)
                        / COUNT(*) * 100
                    FROM TB_SCHEDULE SC
                    WHERE SC.SENIOR_ID = S.SENIOR_ID
                    AND YEAR(SC.TAKING_DATE)=YEAR(CURDATE())
                    AND MONTH(SC.TAKING_DATE)=MONTH(CURDATE())
                ),
            0)
        ) AS complianceRate

    FROM TB_SENIOR S
    WHERE S.MEM_ID = ?
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        res.render("user/user_info/protected", {
            title: "보호대상 정보",
            user: req.session.user,
            protectedPersons: rows
        });

    });

});

// 시니어 정보 입력
router.post("/user/user_info/seniorRegister", isLoggedIn, async (req, res) => {

    const {
        seniorId,
        seniorPw,
        name,
        email,
        contact,
        addr,
        pillboxNum
    } = req.body;

    const memId =
        req.session.user.id;

    const hashedPw =
        await bcrypt.hash(seniorPw, 10);

    const sql = `
    INSERT INTO TB_SENIOR
    (
        SENIOR_ID,
        SENIOR_PW,
        MEM_ID,
        SENIOR_NAME,
        SENIOR_EMAIL,
        SENIOR_CONTACT,
        SENIOR_ADDR,
        PILLBOX_NUM  
    )
    VALUES
    (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    conn.query(
        sql,
        [
            seniorId,
            hashedPw,
            memId,
            name,
            email,
            contact,
            addr,
            pillboxNum || null
        ],
        (err, result) => {

            if(err){
                console.log(err);

                return res.send(
                    "<script>alert('등록 실패');history.back();</script>"
                );
            }

            res.send(
                "<script>alert('대상자 등록 완료');location.href='/user/user_info/protected';</script>"
            );
        }
    );
});

// 시니어 정보 수정
router.get("/user/user_info/protected/edit/:id", (req, res) => {

    const seniorId = req.params.id;

    const sql = `
        SELECT *
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?
    `;

    conn.query(sql, [seniorId], (err, result) => {

        if(err){
            console.log(err);
            return res.redirect("/user/user_info/protected");
        }

        res.render("user/user_info/protected_edit",{
            title:"보호대상 수정",
            person:result[0]
        });

    });

});

// 시니어 정보 수정 완료
router.post("/user/user_info/protected/update/:id",(req,res)=>{

    const seniorId=req.params.id;

    const{

        SENIOR_NAME,
        SENIOR_EMAIL,
        SENIOR_CONTACT,
        SENIOR_ADDR,
        PILLBOX_NUM

    }=req.body;


    const sql=`
    UPDATE TB_SENIOR
    SET
    SENIOR_NAME=?,
    SENIOR_EMAIL=?,
    SENIOR_CONTACT=?,
    SENIOR_ADDR=?,
    PILLBOX_NUM=?
    WHERE SENIOR_ID=?
    `;

    conn.query(sql,[
        SENIOR_NAME,
        SENIOR_EMAIL,
        SENIOR_CONTACT,
        SENIOR_ADDR,
        PILLBOX_NUM,
        seniorId
    ],(err)=>{

        if(err){

            console.log(err);
            return res.redirect("back");
        }
        res.redirect("/user/user_info/protected");
    });
});

// 시니어 정보 삭제
router.get("/user/user_info/protected/delete/:seniorId", isLoggedIn, (req, res) => {

    const seniorId = req.params.seniorId;
    const memId = req.session.user.id;

    // 1. 스케줄 삭제
    const deleteSchedule = `
        DELETE FROM TB_SCHEDULE
        WHERE SENIOR_ID = ?
    `;

    conn.query(deleteSchedule, [seniorId], (err) => {

        if(err){
            console.log(err);
            return res.send("<script>alert('스케줄 삭제 실패');history.back();</script>");
        }

        // 2. 시니어 삭제
        const deleteSenior = `
            DELETE FROM TB_SENIOR
            WHERE SENIOR_ID = ?
            AND MEM_ID = ?
        `;

        conn.query(deleteSenior, [seniorId, memId], (err, result) => {

            if(err){
                console.log(err);
                return res.send("<script>alert('삭제 실패');history.back();</script>");
            }

            res.send("<script>alert('삭제되었습니다.');location.href='/user/user_info/protected';</script>");

        });

    });

});

router.get("/user/user_info/seniorRegister", isLoggedIn, (req, res) => {

    res.render("user/user_info/seniorRegister", {
        title: "대상자 등록",
        user: req.session.user
    });
});

router.get("/index/index_about", (req, res) => {
    res.render("index/index_about", {
        title: "소개 페이지"
    });
});

router.get('/index/index_announce', (req, res) => {
  // 실제 서비스에서는 DB에서 notices 배열을 조회해서 넘기세요.
  const notices = [
    { isNew: true,  category: '공지',    title: '복약안심서비스 정식 오픈 안내',                         date: '2025.06.01' },
    { isNew: true,  category: '업데이트', title: 'v1.2 업데이트 – 복약 이력 리포트 기능 추가',           date: '2025.05.20' },
    { isNew: false, category: '점검',    title: '서버 정기 점검 완료 안내 (5월 15일 02:00~04:00)',       date: '2025.05.15' },
    { isNew: false, category: '공지',    title: '개인정보 처리방침 개정 안내 (2025년 5월)',              date: '2025.05.01' },
    { isNew: false, category: '업데이트', title: 'v1.1 업데이트 – 알림 설정 세분화 및 UI 개선',          date: '2025.04.10' },
    { isNew: false, category: '공지',    title: '스마트 약 보관함 펌웨어 업데이트 방법 안내',            date: '2025.03.28' },
    { isNew: false, category: '공지',    title: '복약안심서비스 베타 테스트 참여자 모집 결과 안내',       date: '2025.03.01' },
  ];

  res.render('index/index_announce', {
    title:   '공지사항',
    notices
  });
});

router.get('/index/index_HowToUse', (req, res) => {
  res.render('index/index_HowToUse', {
    title:   '이용 방법',
  });
});

const account = {
  name: '김민지',
  email: 'silvercare@example.com',
  birth: '1958-03-12',
  phone: '010-1234-5678',
  guardian: '박서준',
  guardianPhone: '010-9876-5432',
  address: '서울특별시 강남구 테헤란로 123',
  joinedAt: '2026.06.25',
  lastLogin: '오늘 09:42',
  privacyNote: '병원 방문 전 보호자에게 주간 복약 리포트를 공유합니다.'
};

router.get('/user/user_info/settings', (req, res) => {
  res.render('user/user_info/settings', {
    pageTitle: '계정 관리',
    account
  });
});



// 태헌님 router 코드

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
 
// 기존 코드를 이렇게 교체하세요 (37번째 줄 근처)
router.get('/user/user_dashboard/main_dashboard', requireLogin, (req, res) => {
  if (!req.session.user.pillboxId) {
    return res.render('user/user_service/no-pillbox', {
      title: '약통 미등록 — 복약안심서비스',
    });
  }

  res.render('user/user_dashboard/main_dashboard', {
    title: '대시보드 — 복약안심서비스',
    user: req.session.user,

    stats: {
      total: 12,
      completed: 9,
      warning: 3,
      rate: 75,
    },

    today: {
      morning: "✅ (❌,✔ 선택)",
      lunch: "❌",
      dinner: "❌",
    },

    weekly: {
      avgRate: 76,
      takenDays: 5,
      missedCount: 4,
      chartData: {
        labels:  ['21일 (월)', '22일 (화)', '23일 (수)', '24일 (목)', '25일 (금)', '26일 (토)', '27일 (일)'],
        morning: [100, 83, 67, 100, 83, 50, 0],
        lunch:   [83,  67, 83,  83, 50, 67, 0],
        dinner:  [67,  50, 67,  83, 67, 33, 0],
      },
    },

    schedule: [
      { time: '08:00', meal: '아침', medicineName: '아스피린 100mg',    dose: '1정', status: 'ok'   },
      { time: '12:30', meal: '점심', medicineName: '혈압약 (암로디핀)', dose: '1정', status: 'warn' },
      { time: '19:00', meal: '저녁', medicineName: '당뇨약 (메트포민)', dose: '2정', status: 'plan' },
    ],

    sensor: {
      lidOpen:      false,
      dbSync:       true,
      lastSync:     '2분 전',
      lastDetected: '오늘 08:03',
      updatedAt:    '09:15',
    },

    alerts: [
      { type: 'warn',    message: '김영희 님이 오늘 점심 복약을 아직 하지 않았습니다.', time: '12:45'       },
      { type: 'missed',  message: '이철수 님 — 3일 연속 저녁 복약 누락 감지.',          time: '어제 20:10' },
      { type: 'ok',      message: '박순자 님 아침 복약 완료 확인.',                      time: '오늘 08:03' },
      { type: 'warn',    message: '스마트 약상자 펌웨어 업데이트 완료.',                 time: '2일 전 14:22'},
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


// 복약 일정 페이지 - DB 없이 화면 확인용
router.get("/user/user_dashboard/dashboard_record", requireLogin, (req, res) => {
  const selectedDate = req.query.date || "2026-06-26";

  const schedules = [
    {
      seniorId: "senior01",
      seniorName: "이민수",
      takingDate: selectedDate,
      takingTime: "08:00",
      takenTime: "08:03",
      pillboxOrder: 1,
      takingType: "아침",
      status: "done",
      statusLabel: "복용 완료",
    },
    {
      seniorId: "senior02",
      seniorName: "박영희",
      takingDate: selectedDate,
      takingTime: "12:30",
      takenTime: "",
      pillboxOrder: 2,
      takingType: "점심",
      status: "miss",
      statusLabel: "미복용",
    },
    {
      seniorId: "senior03",
      seniorName: "정순자",
      takingDate: selectedDate,
      takingTime: "18:30",
      takenTime: "",
      pillboxOrder: 3,
      takingType: "저녁",
      status: "pending",
      statusLabel: "복용 예정",
    },
  ];

  const summary = {
    total: schedules.length,
    done: schedules.filter((item) => item.status === "done").length,
    miss: schedules.filter((item) => item.status === "miss").length,
    pending: schedules.filter((item) => item.status === "pending").length,
  };

  res.render("user/user_dashboard/dashboard_record", {
    title: "복약 일정",
    user: req.session.user,
    selectedDate,
    schedules,
    summary,
  });
});

// 실시간 상태 페이지 - DB 없이 화면 확인용
router.get("/user/user_dashboard/dashboard_stat", requireLogin, (req, res) => {
  const statuses = [
    {
      seniorId: "senior01",
      seniorName: "이민수",
      seniorContact: "010-1111-2222",
      pillboxNum: "PB-001",
      todayTotal: 3,
      todayDone: 3,
      todayMissed: 0,
      latestLogType: "SLOT_OPEN",
      latestSlotNum: 1,
      latestLoggedAt: "2026-06-26 08:03:00",
      state: "ok",
      stateLabel: "정상",
    },
    {
      seniorId: "senior02",
      seniorName: "박영희",
      seniorContact: "010-3333-4444",
      pillboxNum: "PB-002",
      todayTotal: 2,
      todayDone: 0,
      todayMissed: 1,
      latestLogType: "NO_ACTION",
      latestSlotNum: 2,
      latestLoggedAt: "2026-06-26 12:40:00",
      state: "late",
      stateLabel: "확인 필요",
    },
    {
      seniorId: "senior03",
      seniorName: "정순자",
      seniorContact: "010-5555-6666",
      pillboxNum: "PB-003",
      todayTotal: 2,
      todayDone: 1,
      todayMissed: 0,
      latestLogType: "BOX_CLOSED",
      latestSlotNum: 3,
      latestLoggedAt: "2026-06-26 09:15:00",
      state: "warn",
      stateLabel: "대기",
    },
  ];

  const summary = {
    total: statuses.length,
    ok: statuses.filter((item) => item.state === "ok").length,
    warn: statuses.filter((item) => item.state === "warn").length,
    late: statuses.filter((item) => item.state === "late").length,
  };

  res.render("user/user_dashboard/dashboard_stat", {
    title: "실시간 상태",
    user: req.session.user,
    statuses,
    summary,
  });
});

// 알림 관리 페이지 - DB 없이 화면 확인용
router.get("/user/user_dashboard/dashboard_call", requireLogin, (req, res) => {
  const alerts = [
    {
      alertCd: 1,
      seniorId: "senior02",
      seniorName: "박영희",
      alertType: "MISSED_MEDICINE",
      alertMsg: "[복약안심서비스] 박영희님 복약 미확인. 12:30 약통 2번 칸을 확인해주세요.",
      alertTime: "2026-06-26 12:40:00",
      createdAt: "2026-06-26 12:40:00",
      isReceived: "Y",
      className: "late",
    },
    {
      alertCd: 2,
      seniorId: "senior01",
      seniorName: "이민수",
      alertType: "TAKEN",
      alertMsg: "이민수님이 아침 복약을 완료했습니다.",
      alertTime: "2026-06-26 08:03:00",
      createdAt: "2026-06-26 08:03:00",
      isReceived: "Y",
      className: "ok",
    },
    {
      alertCd: 3,
      seniorId: "senior03",
      seniorName: "정순자",
      alertType: "WARN",
      alertMsg: "저녁 복약 시간이 30분 후 시작됩니다.",
      alertTime: "2026-06-26 18:00:00",
      createdAt: "2026-06-26 18:00:00",
      isReceived: "N",
      className: "warn",
    },
  ];

  const summary = {
    total: alerts.length,
    missed: alerts.filter((item) => item.className === "late").length,
    warn: alerts.filter((item) => item.className === "warn").length,
    received: alerts.filter((item) => item.isReceived === "Y").length,
  };

  res.render("user/user_dashboard/dashboard_call", {
    title: "알림 관리",
    user: req.session.user,
    alerts,
    summary,
  });
});

module.exports = router;