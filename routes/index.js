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
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/user/user_service/schedule_register');
  res.render('login/login', { title: '로그인 — 복약안심서비스', error: null });
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
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
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

    console.log(req.session.user);


    console.log("로그인 사용자:", memId);

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

module.exports = router;