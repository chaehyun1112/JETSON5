const express = require('express');
const bcrypt = require("bcrypt");
const router = express.Router();
const conn = require('../config/db');
const mysql = require('mysql2');
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 로그인 체크 미들웨어
function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
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
    const selectedSenior = req.query.seniorId;

    if(!req.session.user){
        return res.redirect("/");
    }

    const sql = `
    SELECT *
    FROM TB_SENIOR S
    WHERE S.MEM_ID = ?
    AND NOT EXISTS
    (
        SELECT 1
        FROM TB_MEDICINE_SCHEDULE M
        WHERE M.SENIOR_ID = S.SENIOR_ID
        AND M.USE_YN = 'Y'
    )
    ORDER BY S.SENIOR_NAME
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
                { 
                    seniors : rows,
                    selectedSenior
                 }
            );
        }
    );
});

// 복약 스케줄 등록 post
router.post("/user/user_service/schedule_register", (req, res) => {

    const {
        seniorId,
        startDate,

        morningPillbox,
        morningTime,
        morningType,

        lunchPillbox,
        lunchTime,
        lunchType,

        dinnerPillbox,
        dinnerTime,
        dinnerType,

        nightPillbox,
        nightTime,
        nightType

    } = req.body;

    const schedules = [];

    if (morningPillbox && morningTime) {
        schedules.push({
            pillbox: morningPillbox,
            type: morningType,
            time: morningTime
        });
    }

    if (lunchPillbox && lunchTime) {
        schedules.push({
            pillbox: lunchPillbox,
            type: lunchType,
            time: lunchTime
        });
    }

    if (dinnerPillbox && dinnerTime) {
        schedules.push({
            pillbox: dinnerPillbox,
            type: dinnerType,
            time: dinnerTime
        });
    }

    if (nightPillbox && nightTime) {
        schedules.push({
            pillbox: nightPillbox,
            type: nightType,
            time: nightTime
        });
    }

    if (schedules.length === 0) {
        return res.send("<script>alert('최소 1개의 복약 스케줄을 입력해주세요.');history.back();</script>");
    }

    const sql = `
        INSERT INTO TB_MEDICINE_SCHEDULE
        (
            SENIOR_ID,
            PILLBOX_ORDER,
            TAKING_TYPE,
            TAKING_TIME,
            START_DATE
        )
        VALUES
        (?, ?, ?, ?, ?)`;

    let count = 0;

    schedules.forEach(schedule => {

        conn.query(
            sql,
            [
                seniorId,
                schedule.pillbox,
                schedule.type,
                schedule.time,
                startDate
            ],
            (err) => {

                if (err) {
                    console.log(err);
                    return;
                }

                count++;

                if (count === schedules.length) {

                    res.send(`
                        <script>
                            alert("복약 스케줄 등록 완료");
                            location.href="/user/user_dashboard/main_dashboard";
                        </script>`);
                }
            }
        );
    });
});

// 약통 등록 페이지
router.get('/user/user_service/register-pillbox', isLoggedIn, (req, res) => {
    if(!req.session.user){
        return res.redirect("/");
    }

    const sql = `
    SELECT *
    FROM TB_SENIOR
    WHERE MEM_ID = ?
    AND (PILLBOX_NUM IS NULL OR PILLBOX_NUM = '')
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

router.post('/user/user_service/register-pillbox', isLoggedIn, (req, res) => {
    const {
        seniorId,
        pillboxId
    } = req.body;

    const sql = `
    UPDATE TB_SENIOR
    SET PILLBOX_NUM = ?
    WHERE SENIOR_ID = ?
    AND (PILLBOX_NUM IS NULL OR PILLBOX_NUM = '')

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

// 회원가입 get
router.get('/join', (req, res) => {
    res.render('login/join');
});

// 회원가입 post
router.post("/join", async (req, res) => {

    const { role, id, pw, name, email, addr, phone } = req.body;

    // TB_MEMBER와 TB_SENIOR 둘 다 검사
    const checkSql = `
        SELECT MEM_ID AS ID
        FROM TB_MEMBER
        WHERE MEM_ID = ?

        UNION

        SELECT SENIOR_ID AS ID
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?
    `;

    conn.query(checkSql, [id, id], async (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('DB 오류');history.back();</script>");
        }

        // 이미 존재하는 아이디
        if (rows.length > 0) {
            return res.send("<script>alert('이미 사용중인 아이디입니다.');history.back();</script>");
        }

        // 비밀번호 암호화
        const hashedPw = await bcrypt.hash(pw, 10);

        // 회원가입
        const sql = `
            INSERT INTO TB_MEMBER
            (
                MEM_ID,
                MEM_PW,
                MEM_NAME,
                MEM_EMAIL,
                MEM_CONTACT,
                MEM_ADDR,
                MEM_ST
            )
            VALUES
            (?, ?, ?, ?, ?, ?, ?)`;

        conn.query(
            sql,
            [
                id,
                hashedPw,
                name,
                email,
                phone,
                addr || null,
                role
            ],
            (err) => {

                if (err) {
                    console.log(err);
                    return res.send("<script>alert('회원가입 실패');history.back();</script>");
                }

                // 대상자 회원가입인 경우
                if (role === "S") {

                    const seniorSql = `
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

                    console.log(seniorSql);

                    console.log([
                        id,
                        hashedPw,
                        null,
                        name,
                        email,
                        phone,
                        addr || null,
                        null
                    ]);

                    conn.query(
                        seniorSql,
                        [
                            id,             // SENIOR_ID
                            hashedPw,
                            null,           // 보호자가 없으므로 NULL
                            name,
                            email,
                            phone,
                            addr || null,
                            null            // 약통번호는 나중에 등록
                        ],
                        (err) => {

                            if (err) {
                                console.log(err);

                                return res.send(
                                    "<script>alert('TB_SENIOR 저장 실패');history.back();</script>"
                                );
                            }

                            res.send(
                                "<script>alert('회원가입이 완료되었습니다.');location.href='/login';</script>"
                            );
                        }
                    );
                }

                // 보호자(P), 관리자(A)
                else {
                    res.send(
                        "<script>alert('회원가입이 완료되었습니다.');location.href='/login';</script>"
                    );
                }
            }
        );
    });
});

// 이메일 인증번호 발송
router.post("/sendEmailCode", async (req, res) => {

    const { email } = req.body;

    // 6자리 인증번호 생성
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 세션에 저장
    req.session.emailCode = code;
    req.session.email = email;

    try {

        await transporter.sendMail({

            from: process.env.EMAIL_USER,

            to: email,

            subject: "[스마트 약상자] 이메일 인증번호",

            html: `
                <h2>이메일 인증번호</h2>

                <h1>${code}</h1>

                <p>5분 안에 입력해주세요.</p>
            `

        });

        res.json({
            success: true
        });

    } catch(err){
    console.log("메일 발송 오류");
        console.log(err);

        res.json({
            success:false
        });
    }
});

// 이메일 인증번호 확인
router.post("/verifyEmailCode", (req,res)=>{

    const { code } = req.body;

    if(req.session.emailCode === code){

        req.session.emailVerified = true;

        return res.json({
            success:true
        });

    }

    res.json({
        success:false
    });

});


// 아이디 중복 확인
router.post("/checkId", (req, res) => {

    const { id } = req.body;

    const sql = `
        SELECT MEM_ID AS ID
        FROM TB_MEMBER
        WHERE MEM_ID = ?

        UNION ALL

        SELECT SENIOR_ID AS ID
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?
    `;

    conn.query(sql, [id, id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.json({ available: false });
        }

        res.json({
            available: rows.length === 0
        });
    });
});

// 로그인 GET
router.get("/login", (req, res) => {

    if (req.session.user) {

        if (req.session.user.role === "A") {
            return res.redirect("/admin/admin_dashboard/admin");
        }

        return res.redirect("/user/user_service/schedule_register");
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
                return res.redirect("/user/senior_service/senior_about");
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

    if (!req.session.user || req.session.user.role !== "A") {
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
                </script>`);
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

// 회원탈퇴
router.post("/user/user_info/delete", isLoggedIn, (req, res) => {

    const memId = req.session.user.id;

    // 회원 정보 조회
    const memberSql = `
        SELECT MEM_ST
        FROM TB_MEMBER
        WHERE MEM_ID = ?`;

    conn.query(memberSql, [memId], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('오류가 발생했습니다.');history.back();</script>");
        }

        if (rows.length === 0) {
            return res.send("<script>alert('회원을 찾을 수 없습니다.');location.href='/login';</script>");
        }

        const memberType = rows[0].MEM_ST;

        conn.beginTransaction(err => {

            if (err) {
                console.log(err);
                return res.send("<script>alert('오류가 발생했습니다.');history.back();</script>");
            }

            // 보호자
            if (memberType === "P") {

                const seniorSql = `
                    SELECT SENIOR_ID
                    FROM TB_SENIOR
                    WHERE MEM_ID = ?
                `;

                conn.query(seniorSql, [memId], (err, seniorRows) => {

                    if (err)
                        return conn.rollback(() => {
                            console.log(err);
                            res.send("<script>alert('탈퇴 실패');history.back();</script>");
                        });

                    const seniorIds = seniorRows.map(row => row.SENIOR_ID);

                    const deleteSchedules = (callback) => {

                        if (seniorIds.length === 0) return callback();

                        conn.query(
                            "DELETE FROM TB_SCHEDULE WHERE SENIOR_ID IN (?)",
                            [seniorIds],
                            (err) => {

                                if (err)
                                    return conn.rollback(() => {
                                        console.log(err);
                                        res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                    });

                                conn.query(
                                    "DELETE FROM TB_MEDICINE_SCHEDULE WHERE SENIOR_ID IN (?)",
                                    [seniorIds],
                                    (err) => {

                                        if (err)
                                            return conn.rollback(() => {
                                                console.log(err);
                                                res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                            });

                                        callback();
                                    }
                                );
                            }
                        );
                    };

                    deleteSchedules(() => {

                        conn.query(
                            "DELETE FROM TB_SENIOR WHERE MEM_ID = ?",
                            [memId],
                            (err) => {

                                if (err)
                                    return conn.rollback(() => {
                                        console.log(err);
                                        res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                    });

                                conn.query(
                                    "DELETE FROM TB_MEMBER WHERE MEM_ID = ?",
                                    [memId],
                                    (err) => {

                                        if (err)
                                            return conn.rollback(() => {
                                                console.log(err);
                                                res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                            });

                                        conn.commit(err => {

                                            if (err)
                                                return conn.rollback(() => {
                                                    console.log(err);
                                                    res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                                });

                                            req.session.destroy(() => {
                                                res.send("<script>alert('회원탈퇴가 완료되었습니다.');location.href='/login';</script>");
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    });
                });
            }
            // 대상자
            else if (memberType === "S") {

                const seniorSql = `
                    SELECT SENIOR_ID
                    FROM TB_SENIOR
                    WHERE SENIOR_ID = ?
                `;

                conn.query(seniorSql, [memId], (err, seniorRows) => {

                    if (err)
                        return conn.rollback(() => {
                            console.log(err);
                            res.send("<script>alert('탈퇴 실패');history.back();</script>");
                        });

                    if (seniorRows.length === 0)
                        return conn.rollback(() => {
                            res.send("<script>alert('시니어 정보를 찾을 수 없습니다.');history.back();</script>");
                        });

                    const seniorId = seniorRows[0].SENIOR_ID;

                    // 복약기록 삭제
                    conn.query(
                        "DELETE FROM TB_SCHEDULE WHERE SENIOR_ID=?",
                        [seniorId],
                        (err) => {

                            if (err)
                                return conn.rollback(() => {
                                    console.log(err);
                                    res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                });

                            // 복약스케줄 삭제
                            conn.query(
                                "DELETE FROM TB_MEDICINE_SCHEDULE WHERE SENIOR_ID=?",
                                [seniorId],
                                (err) => {

                                    if (err)
                                        return conn.rollback(() => {
                                            console.log(err);
                                            res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                        });

                                    // 시니어 삭제
                                    conn.query(
                                        "DELETE FROM TB_SENIOR WHERE SENIOR_ID=?",
                                        [seniorId],
                                        (err) => {

                                            if (err)
                                                return conn.rollback(() => {
                                                    console.log(err);
                                                    res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                                });

                                            // 회원 삭제
                                            conn.query(
                                                "DELETE FROM TB_MEMBER WHERE MEM_ID=?",
                                                [memId],
                                                (err) => {

                                                    if (err)
                                                        return conn.rollback(() => {
                                                            console.log(err);
                                                            res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                                        });

                                                    conn.commit(err => {

                                                        if (err)
                                                            return conn.rollback(() => {
                                                                console.log(err);
                                                                res.send("<script>alert('탈퇴 실패');history.back();</script>");
                                                            });

                                                        req.session.destroy(() => {
                                                            res.send("<script>alert('회원탈퇴가 완료되었습니다.');location.href='/login';</script>");
                                                        });
                                                    });
                                                });
                                        });
                                });
                        });
                });
            }

            // 관리자
            else {
                conn.query(
                    "DELETE FROM TB_MEMBER WHERE MEM_ID=?",
                    [memId],
                (err) => {

                    if (err)
                        return conn.rollback(() => {
                            console.log(err);
                            res.send("<script>alert('탈퇴 실패');history.back();</script>");
                        });

                    conn.commit(err => {

                        if (err)
                            return conn.rollback(() => {
                                console.log(err);
                                res.send("<script>alert('탈퇴 실패');history.back();</script>");
                            });

                        req.session.destroy(() => {
                            res.send("<script>alert('회원탈퇴가 완료되었습니다.');location.href='/login';</script>");
                        });
                    });
                });
            }
        });
    });
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

// 기존 코드를 이렇게 교체하세요 (37번째 줄 근처)
router.get('/user/user_dashboard/main_dashboard', isLoggedIn, (req, res) => {
    const sql = `
        SELECT PILLBOX_NUM
        FROM TB_SENIOR
        WHERE MEM_ID = ?
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        // 시니어가 등록되지 않았거나 약통번호가 없는 경우
        if (rows.length === 0 || !rows[0].PILLBOX_NUM) {
            return res.render('user/user_service/no-pillbox', {
                title: '약통 미등록 — 복약안심서비스'
            });
        }

        res.render('user/user_dashboard/main_dashboard', {
            title: '대시보드 — 복약안심서비스',
            user: req.session.user,

            seniorList: [
                { id: 'senior01', name: '이민수' },
                { id: 'senior02', name: '박영희' },
                { id: 'senior03', name: '정순자' },
            ],
            selectedSenior: req.query.senior || 'senior01',

            stats: {
            total: 12,
            completed: 9,
            warning: 3,
            rate: 75,
            },

            today: {
            morning: "✅",
            lunch: "❌",
            dinner: "❌",
            bedtime: "❌",
            },

            weekly: {
            avgRate: 76,
            takenDays: 5,
            missedCount: 4,
            table: {
                range: '6월 9일 ~ 15일',
                days: [
                    { label: '월', morning: 'done',    lunch: 'done',    dinner: 'done',    bedtime: 'done',    rate: 100 },
                    { label: '화', morning: 'done',    lunch: 'missed',  dinner: 'done',    bedtime: 'done',    rate: 75  },
                    { label: '수', morning: 'done',    lunch: 'done',    dinner: 'done',    bedtime: 'done',    rate: 100 },
                    { label: '목', morning: 'done',    lunch: 'done',    dinner: 'pending', bedtime: 'pending', rate: 50  },
                    { label: '금', morning: 'unset',   lunch: 'unset',   dinner: 'unset',   bedtime: 'unset',   rate: null },
                    { label: '토', morning: 'unset',   lunch: 'unset',   dinner: 'unset',   bedtime: 'unset',   rate: null },
                    { label: '일', morning: 'unset',   lunch: 'unset',   dinner: 'unset',   bedtime: 'unset',   rate: null },
                ],
            },
            },

            schedule: [
            { time: '08:00', meal: '아침',   medicineName: '아스피린 100mg',    dose: '1정', status: 'ok'   },
            { time: '12:30', meal: '점심',   medicineName: '혈압약 (암로디핀)', dose: '1정', status: 'warn' },
            { time: '19:00', meal: '저녁',   medicineName: '당뇨약 (메트포민)', dose: '2정', status: 'plan' },
            { time: '22:00', meal: '자기전', medicineName: '수면유도제',        dose: '1정', status: 'plan' },
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
});

router.get("/admin/admin_dashboard/members", (req, res) => {
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

  res.render("admin/admin_dashboard/members", {
    title: "회원관리",
    pageTitle: "회원관리",
    members,
  });
});

router.get("/admin/admin_dashboard/medicine_boxes", (req, res) => {
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

  res.render("admin/admin_dashboard/medicine_boxes", {
    title: "약상자 관리",
    pageTitle: "약상자 관리",
    medicineBoxes,
  });
});


router.get("/admin/admin_dashboard/messages", (req, res) => {
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

  res.render("admin/admin_dashboard/messages", {
    title: "알림메시지",
    pageTitle: "알림메시지",
    messages,
  });
});



router.get("/admin/members_update", (req, res) => {
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
        WHERE S.MEM_ID = ?`;

    conn.query(sql,[req.session.user.id],(err,rows)=>{

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        if(rows.length===0){

            return res.render("user/user_info/protected",{

                title:"보호대상 정보",
                user:req.session.user,
                protectedPersons:[]
            });
        }

        const scheduleSql=`
            SELECT *
            FROM TB_MEDICINE_SCHEDULE
            WHERE USE_YN='Y'
            ORDER BY TAKING_TIME
        `;

        conn.query(scheduleSql,(err2,scheduleRows)=>{

            if(err2){
                console.log(err2);
                return res.send("DB 오류");
            }

            rows.forEach(person=>{

                person.scheduleList=scheduleRows.filter(schedule=>{
                    return schedule.SENIOR_ID===person.SENIOR_ID;
                });
            });

            res.render("user/user_info/protected",{

                title:"보호대상 정보",
                user:req.session.user,
                protectedPersons:rows

            });
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

    const memId = req.session.user.id;

    // 아이디 중복 검사
    const checkSql = `
        SELECT MEM_ID AS ID
        FROM TB_MEMBER
        WHERE MEM_ID = ?

        UNION

        SELECT SENIOR_ID AS ID
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?
    `;

    conn.query(checkSql, [seniorId, seniorId], async (err, rows) => {

        if (err) {
            console.log(err);

            return res.send(
                "<script>alert('DB 오류가 발생했습니다.');history.back();</script>"
            );
        }

        // 이미 존재하는 아이디
        if (rows.length > 0) {

            return res.send(
                "<script>alert('이미 사용중인 아이디입니다.');history.back();</script>"
            );
        }

        // 비밀번호 암호화
        const hashedPw = await bcrypt.hash(seniorPw, 10);

        // 시니어 등록
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
            (err) => {

                if (err) {

                    console.log(err);

                    return res.send(`
                        <h2>등록 실패</h2>
                        <pre>${err.sqlMessage}</pre>`);
                }

                // 보호대상 추가 후 약통 미등록 시 조건문 추가 (박건희)
                if (pillboxNum) {
                    return res.send(`
                    <script>
                    alert('대상자 등록이 완료되었습니다. 복약 스케줄을 등록해주세요.');
                        location.href='/user/user_service/schedule_register?seniorId=${seniorId}';
                    </script>
                    `);
                }

                return res.send(`
                <script>
                    alert('대상자 등록이 완료되었습니다. 약통을 먼저 등록해주세요.');
                    location.href='/user/user_service/register-pillbox';
                </script>
                `);

            }
        );
    });
});

// 시니어 정보 수정 화면 GET
router.get("/user/user_info/user_update/:id", (req, res) => {

    const seniorId = req.params.id;

    const seniorSql = `
        SELECT *
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?`;

    const scheduleSql = `
        SELECT *
        FROM TB_MEDICINE_SCHEDULE
        WHERE SENIOR_ID = ?
        AND USE_YN = 'Y'`;

    conn.query(seniorSql, [seniorId], (err, seniorResult) => {

        if (err) {
            console.log(err);
            return res.redirect("/user/user_info/protected");
        }

        if (seniorResult.length === 0) {
            return res.redirect("/user/user_info/protected");
        }

        conn.query(scheduleSql, [seniorId], (err2, scheduleResult) => {

            if (err2) {
                console.log(err2);
                return res.redirect("/user/user_info/protected");
            }

            const morning = scheduleResult.find(s => s.TAKING_TYPE === "아침");
            const lunch   = scheduleResult.find(s => s.TAKING_TYPE === "점심");
            const dinner  = scheduleResult.find(s => s.TAKING_TYPE === "저녁");
            const night   = scheduleResult.find(s => s.TAKING_TYPE === "취침 전");

            res.render("user/user_info/user_update", {
                title: "보호대상 수정",
                person: seniorResult[0],

                morning,
                lunch,
                dinner,
                night
            });
        });
    });
});

// 시니어 정보 수정 완료 POST
router.post("/user/user_info/protected/update/:id", (req, res) => {

    const seniorId = req.params.id;

    const {
        SENIOR_NAME,
        SENIOR_EMAIL,
        SENIOR_CONTACT,
        SENIOR_ADDR,
        PILLBOX_NUM,

        morningPillbox,
        morningTime,
        morningType,

        lunchPillbox,
        lunchTime,
        lunchType,

        dinnerPillbox,
        dinnerTime,
        dinnerType,

        nightPillbox,
        nightTime,
        nightType

    } = req.body;

    // 1. 시니어 정보 수정
    const seniorSql = `
        UPDATE TB_SENIOR
        SET
            SENIOR_NAME=?,
            SENIOR_EMAIL=?,
            SENIOR_CONTACT=?,
            SENIOR_ADDR=?,
            PILLBOX_NUM=?
        WHERE SENIOR_ID=?
    `;

    conn.query(
        seniorSql,
        [
            SENIOR_NAME,
            SENIOR_EMAIL,
            SENIOR_CONTACT,
            SENIOR_ADDR,
            PILLBOX_NUM,
            seniorId
        ],
        (err) => {

            if(err){
                console.log(err);
                return res.redirect("back");
            }

            // 2. 기존 스케줄 종료
            const endSql = `
                UPDATE TB_MEDICINE_SCHEDULE
                SET
                    USE_YN='N',
                    END_DATE=CURDATE(),
                    UPDATED_AT=NOW()
                WHERE SENIOR_ID=?
                AND USE_YN='Y'
            `;

            conn.query(endSql,[seniorId],(err2)=>{

                if(err2){
                    console.log(err2);
                    return res.redirect("back");
                }

                const schedules=[];

                if(morningPillbox && morningTime){

                    schedules.push([
                        seniorId,
                        morningPillbox,
                        morningType,
                        morningTime
                    ]);
                }

                if(lunchPillbox && lunchTime){

                    schedules.push([
                        seniorId,
                        lunchPillbox,
                        lunchType,
                        lunchTime
                    ]);
                }

                if(dinnerPillbox && dinnerTime){

                    schedules.push([
                        seniorId,
                        dinnerPillbox,
                        dinnerType,
                        dinnerTime
                    ]);
                }

                if(nightPillbox && nightTime){

                    schedules.push([
                        seniorId,
                        nightPillbox,
                        nightType,
                        nightTime
                    ]);
                }

                // 스케줄이 하나도 없으면 종료
                if(schedules.length===0){
                    return res.redirect("/user/user_info/protected");
                }

                const insertSql=`
                    INSERT INTO TB_MEDICINE_SCHEDULE
                    (
                        SENIOR_ID,
                        PILLBOX_ORDER,
                        TAKING_TYPE,
                        TAKING_TIME,
                        START_DATE
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        CURDATE()
                    )`;

                let count=0;

                schedules.forEach(schedule=>{

                    conn.query(
                        insertSql,
                        schedule,
                        (err3)=>{

                            if(err3){
                                console.log(err3);
                            }

                            count++;
                            if(count===schedules.length){
                                res.redirect("/user/user_info/protected");
                            }
                        }
                    );
                });
            });
        }
    );
});

// 시니어 정보 삭제
router.get("/user/user_info/protected/delete/:seniorId", isLoggedIn, (req, res) => {

    const seniorId = req.params.seniorId;
    const memId = req.session.user.id;

    // 1. 스케줄 삭제
    const deleteSchedule = `
        DELETE FROM TB_MEDICINE_SCHEDULE
        WHERE SENIOR_ID = ?`;

    conn.query(deleteSchedule, [seniorId], (err) => {

        if(err){
            console.log(err);
            return res.send("<script>alert('스케줄 삭제 실패');history.back();</script>");
        }

        // 2. 시니어 삭제
        const deleteSenior = `
            DELETE FROM TB_SENIOR
            WHERE SENIOR_ID = ?
            AND MEM_ID = ?`;

        conn.query(deleteSenior, [seniorId, memId], (err, result) => {

            if(err){
                console.log(err);
                return res.send("<script>alert('삭제 실패');history.back();</script>");
            }

            // 삭제 대상 없을 때 조건 추가 (박건희)
            if (result.affectedRows === 0) {
                return res.send("<script>alert('삭제할 대상자가 없습니다.');history.back();</script>");
            }

            res.send("<script>alert('삭제되었습니다.');location.href='/user/user_info/protected';</script>");

        });
    });
});

// 개인정보 관리
router.get('/user/user_info/settings', isLoggedIn, (req, res) => {

    const sql = `
        SELECT *
        FROM TB_MEMBER
        WHERE MEM_ID = ?
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        if (rows.length === 0) {
            return res.redirect("/login");
        }

        res.render("user/user_info/settings", {
            pageTitle: "계정 관리",
            account: rows[0]
        });
    });
});

// 계정 정보 수정
router.post("/user/user_info/settings/update", isLoggedIn, (req, res) => {
    console.log("설정 저장 POST");
    console.log(req.body);

    const {
        MEM_NAME,
        MEM_EMAIL,
        MEM_CONTACT,
        MEM_ADDR
    } = req.body;

    const sql = `
        UPDATE TB_MEMBER
        SET
            MEM_NAME = ?,
            MEM_EMAIL = ?,
            MEM_CONTACT = ?,
            MEM_ADDR = ?
        WHERE MEM_ID = ?`;

    conn.query(
        sql,
        [
            MEM_NAME,
            MEM_EMAIL,
            MEM_CONTACT,
            MEM_ADDR,
            req.session.user.id
        ],
        (err) => {

            if (err) {
                console.log(err);

                return res.send(
                    "<script>alert('수정 실패');history.back();</script>"
                );
            }

            // 세션 이름도 함께 갱신
            req.session.user.name = MEM_NAME;

            res.send(
                "<script>alert('회원정보가 수정되었습니다.');location.href='/user/user_info/settings';</script>"
            );
        }
    );
});


router.get("/user/user_info/seniorRegister", isLoggedIn, (req, res) => {

    res.render("user/user_info/seniorRegister", {
        title: "대상자 등록",
        user: req.session.user,
        from: req.query.from || ""
    });
});

router.get("/index/index_about", (req, res) => {
    res.render("index/index_about", {
        title: "소개 페이지"
    });
});


router.get('/index/index_HowToUse', (req, res) => {
  res.render('index/index_HowToUse', {
    title:   '이용 방법',
  });
});



// 김성훈 6월 30일 추가한 router (admin_update, send_message)


router.get('/index/index_announce', (req, res) => {
  // 1. 현재 로그인한 유저의 세션 정보 가져오기 (로그인 안 되어 있으면 null이나 빈 객체)
const notices = [
    { isNew: true,  category: '공지',    title: '복약안심서비스 정식 오픈 안내',                         date: '2025.06.01' },
    { isNew: true,  category: '업데이트', title: 'v1.2 업데이트 – 복약 이력 리포트 기능 추가',           date: '2025.05.20' },
    { isNew: false, category: '점검',    title: '서버 정기 점검 완료 안내 (5월 15일 02:00~04:00)',       date: '2025.05.15' },
    { isNew: false, category: '공지',    title: '개인정보 처리방침 개정 안내 (2025년 5월)',              date: '2025.05.01' },
    { isNew: false, category: '업데이트', title: 'v1.1 업데이트 – 알림 설정 세분화 및 UI 개선',          date: '2025.04.10' },
    { isNew: false, category: '공지',    title: '스마트 약 보관함 펌웨어 업데이트 방법 안내',            date: '2025.03.28' },
    { isNew: false, category: '공지',    title: '복약안심서비스 베타 테스트 참여자 모집 결과 안내',       date: '2025.03.01' },
];

if (!req.session.user) {
        return res.render('index/index_announce', {
            title: '공지사항',
            notices,
            member: null
        });
    }

    // 로그인 안 한 경우
    if (!req.session.user) {
        return res.render('index/index_announce', {
            title: '공지사항',
            notices,
            member: null
        });
    }

    // 로그인한 경우에만 DB 조회
    const sql = `
        SELECT MEM_ST
        FROM TB_MEMBER
        WHERE MEM_ID = ?
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if (err) {
            console.log(err);
            return;
        }

        res.render('index/index_announce', {
            title: '공지사항',
            notices,
            member: rows[0]
        });
    });
});


let tempAdminData = {
    MEM_ID: 'admin',
    MEM_NM: '김성훈',
    MEM_ST: 'A',
    REG_DATE: '2026.03.15', // 수정 불가 항목
    MGR_NM: '홍길동',
    MGR_EMAIL: 'manager@example.com',
    MGR_PHONE: '010-1234-5678',
    MGR_ADDR: '광주광역시 북구 용봉동'
};


router.get('/admin/admin_update', (req, res) => {

    res.render('admin/admin_update', {
        title: '관리자 정보 설정 (데모 버전)',
        member: tempAdminData
    });
});

let tempHistory = [
    { date: '2026.06.30 09:15', target: '전체 회원', type: '일반 안내', title: '정기 서버 점검 안내 사항입니다.' },
    { date: '2026.06.29 14:20', target: '미복약 유저', type: '🔔 복약 독려', title: '점심 약 복약 시간이 경과되었습니다.' }
];

/**
 * 1️⃣ [GET] 메시지 발송 페이지 로드
 * URL: /admin/send_message
 */
router.get('/admin/send_message', (req, res) => {
    res.render('admin/send_message', {
        title: '회원 메시지 발송',
        history: tempHistory // 최신 임시 이력 데이터를 표에 뿌려주기 위해 전달
    });
});

/**
 * 2️⃣ [POST] 메시지 전송 요청 처리 (이력 누적)
 * URL: /admin/send_message
 */
router.post('/admin/send_message', (req, res) => {
    const { target, type, title, content } = req.body;

    // 현재 날짜 및 시각 생성 (YYYY.MM.DD HH:MM)
    const now = new Date();
    const formattedDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 새 이력 데이터 객체 생성 후 배열 맨 앞에 추가(최신순 정렬)
    const newLog = {
        date: formattedDate,
        target: target,
        type: type,
        title: title
    };
    tempHistory.unshift(newLog);

    // 실제 서비스 환경이라면 여기서 외부 SMS API나 Firebase Push API를 트리거하게 됩니다.
    console.log(`[메시지 발송 로그] 대상: ${target} | 유형: ${type} | 제목: ${title}`);

    res.json({ success: true });
});

// 약 스케줄 get
// 복약 스케줄 등록 페이지
router.get("/user/user_service/schedule_register", (req, res) => {

    const selectedSenior = req.query.seniorId;

    if (!req.session.user) {
        return res.redirect("/");
    }

    let sql = "";
    let params = [];

    // 약통 등록 후 넘어온 경우
    if (selectedSenior) {

        sql = `
            SELECT *
            FROM TB_SENIOR
            WHERE MEM_ID = ?
            AND SENIOR_ID = ?
        `;

        params = [
            req.session.user.id,
            selectedSenior
        ];

    }

    // 메뉴에서 직접 들어온 경우
    else {

        sql = `
            SELECT *
            FROM TB_SENIOR S
            WHERE S.MEM_ID = ?
            AND NOT EXISTS
            (
                SELECT 1
                FROM TB_MEDICINE_SCHEDULE M
                WHERE M.SENIOR_ID = S.SENIOR_ID
                AND M.USE_YN = 'Y'
            )
            ORDER BY S.SENIOR_NAME
        `;

        params = [
            req.session.user.id
        ];

    }

    conn.query(sql, params, (err, rows) => {

        if (err) {
            console.log(err);
            return;
        }

        res.render(
            "user/user_service/schedule_register",
            {
                seniors: rows,
                selectedSenior
            }
        );

    });

});

// 복약 스케줄 등록
router.post("/user/user_service/schedule_register", (req, res) => {

    const {
        seniorId,
        startDate,

        morningPillbox,
        morningTime,
        morningType,

        lunchPillbox,
        lunchTime,
        lunchType,

        dinnerPillbox,
        dinnerTime,
        dinnerType,

        nightPillbox,
        nightTime,
        nightType

    } = req.body;

    const schedules = [];

    if (morningPillbox && morningTime) {
        schedules.push({
            pillbox: morningPillbox,
            type: morningType,
            time: morningTime
        });
    }

    if (lunchPillbox && lunchTime) {
        schedules.push({
            pillbox: lunchPillbox,
            type: lunchType,
            time: lunchTime
        });
    }

    if (dinnerPillbox && dinnerTime) {
        schedules.push({
            pillbox: dinnerPillbox,
            type: dinnerType,
            time: dinnerTime
        });
    }

    if (nightPillbox && nightTime) {
        schedules.push({
            pillbox: nightPillbox,
            type: nightType,
            time: nightTime
        });
    }

    if (schedules.length === 0) {
        return res.send("<script>alert('최소 1개의 복약 스케줄을 입력해주세요.');history.back();</script>");
    }

    // 이미 등록된 스케줄 확인
    const checkSql = `
        SELECT MEDI_SCHE_CD
        FROM TB_MEDICINE_SCHEDULE
        WHERE SENIOR_ID = ?
        AND USE_YN = 'Y'
    `;

    conn.query(checkSql, [seniorId], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('오류가 발생했습니다.');history.back();</script>");
        }

        if (rows.length > 0) {

            return res.send(`
                <script>
                    alert("이미 복약 스케줄이 등록되어 있습니다.\\n복약 스케줄 수정 메뉴를 이용해주세요.");
                    history.back();
                </script>
            `);

        }

        const insertSql = `
            INSERT INTO TB_MEDICINE_SCHEDULE
            (
                SENIOR_ID,
                PILLBOX_ORDER,
                TAKING_TYPE,
                TAKING_TIME,
                START_DATE
            )
            VALUES
            (?, ?, ?, ?, ?)
        `;

        let count = 0;

        schedules.forEach(schedule => {

            conn.query(
                insertSql,
                [
                    seniorId,
                    schedule.pillbox,
                    schedule.type,
                    schedule.time,
                    startDate
                ],
                (err) => {

                    if (err) {
                        console.log(err);
                        return res.send("<script>alert('복약 스케줄 등록 실패');history.back();</script>");
                    }

                    count++;

                    if (count === schedules.length) {

                        res.send(`
                            <script>
                                alert("복약 스케줄 등록 완료");
                                location.href="/user/user_dashboard/main_dashboard";
                            </script>
                        `);

                    }

                }

            );

        });

    });

});


router.get('/user/senior_service/senior_about', (req, res) => {
  res.render('user/senior_service/senior_about', { title: '서비스 소개 — 복약안심서비스' });
});

// 보호자 등록 get
router.get("/user/senior_info/senior_register", isLoggedIn, (req, res) => {

    res.render("user/senior_info/senior_register", {
        title: "대상자 등록",
        user: req.session.user
    });
});

// 보호자 등록 post
router.post("/user/senior_info/senior_register", isLoggedIn, (req, res) => {

    const { guardianId, guardianName } = req.body;

    // 보호자 존재 확인
    const checkSql = `
        SELECT *
        FROM TB_MEMBER
        WHERE MEM_ID = ?
          AND MEM_NAME = ?
          AND MEM_ST = 'P'
    `;

    conn.query(checkSql, [guardianId, guardianName], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('DB 오류');history.back();</script>");
        }

        if (rows.length === 0) {
            return res.send("<script>alert('보호자 정보를 찾을 수 없습니다.');history.back();</script>");
        }

        // 현재 로그인한 시니어와 보호자 연결
        const updateSql = `
            UPDATE TB_SENIOR
            SET MEM_ID = ?
            WHERE SENIOR_ID = ?
              AND MEM_ID IS NULL
        `;

        conn.query(updateSql, [guardianId, req.session.user.id], (err, result) => {

            if (err) {
                console.log(err);
                return res.send("<script>alert('등록 실패');history.back();</script>");
            }

            if (result.affectedRows === 0) {
                return res.send("<script>alert('이미 보호자가 등록되어 있거나 대상자를 찾을 수 없습니다.');history.back();</script>");
            }

            return res.send(`
                <script>
                    alert('보호자 등록이 완료되었습니다.');
                    location.href='/user/senior_service/senior_about';
                </script>
            `);
        });
    });
});

router.get("/user/senior_info/senior_settings", isLoggedIn, (req, res) => {

    const seniorId = req.session.user.id;

    // 시니어 정보 조회
    const seniorSql = `
        SELECT *
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?
    `;

    conn.query(seniorSql, [seniorId], (err, seniorRows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        if (seniorRows.length === 0) {
            return res.send("시니어 정보를 찾을 수 없습니다.");
        }

        const senior = seniorRows[0];

        // 보호자가 아직 등록되지 않은 경우
        if (!senior.MEM_ID) {

            return res.render("user/senior_info/senior_settings", {
                pageTitle: "계정 관리",
                account: senior,
                guardian: null,
                user: req.session.user
            });
        }

        // 보호자 정보 조회
        const guardianSql = `
            SELECT
                MEM_NAME,
                MEM_CONTACT
            FROM TB_MEMBER
            WHERE MEM_ID = ?
            AND MEM_ST = 'P'
        `;

        conn.query(guardianSql, [senior.MEM_ID], (err, guardianRows) => {

            if (err) {
                console.log(err);
                return res.send("DB 오류");
            }

            const guardian = guardianRows.length > 0
                ? guardianRows[0]
                : null;

            res.render("user/senior_info/senior_settings", {
                pageTitle: "계정 관리",
                account: senior,
                guardian,
                user: req.session.user
            });
        });
    });
});

// 태헌님 router 코드
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

// 복약 기록 페이지 - DB 없이 화면 확인용
router.get("/user/user_dashboard/dashboard_record", isLoggedIn, (req, res) => {
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
router.get("/user/user_dashboard/dashboard_stat", isLoggedIn, (req, res) => {
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
router.get("/user/user_dashboard/dashboard_call", isLoggedIn, (req, res) => {
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