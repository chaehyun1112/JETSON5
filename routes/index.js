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
    FROM TB_SENIOR
    WHERE MEM_ID = ?`;

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

// 보호자 웹페이지 약통 등록 페이지 get
router.get('/user/user_service/register-pillbox', isLoggedIn, (req, res) => {
    if(!req.session.user){
        return res.redirect("/");
    }

    const sql = `
    SELECT *
    FROM TB_SENIOR
    WHERE MEM_ID = ?
    AND (PILLBOX_NUM IS NULL OR PILLBOX_NUM = '')`;

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
    );
});

// 보호자 웹페이지 약통 등록 페이지 post
router.post('/user/user_service/register-pillbox', isLoggedIn, (req, res) => {
    const {
        seniorId,
        pillboxId
    } = req.body;

    const sql = `
    UPDATE TB_SENIOR
    SET PILLBOX_NUM = ?
    WHERE SENIOR_ID = ?
    AND (PILLBOX_NUM IS NULL OR PILLBOX_NUM = '')`;

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

// 시니어 웹페이지 약통 등록 get
router.get("/user/senior_info/senior_register-pillbox", isLoggedIn, (req, res) => {
    res.render("user/senior_info/senior_register-pillbox", {
        title: "약통 등록",
        user: req.session.user,
        error: null
    });
});

// 시니어 웹페이지 약통 등록 POST
router.post("/user/senior_info/senior_register-pillbox", isLoggedIn, (req, res) => {
    const { pillboxNum } = req.body;
    const seniorId = req.session.user.id;
    if (!pillboxNum) {
        return res.send("<script>alert('약통 번호를 입력해주세요.');history.back();</script>");
    }
    const mySql = `
        SELECT PILLBOX_NUM
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?`;

    conn.query(mySql, [seniorId], (err, rows) => {
        if (err) {
            console.log(err);
            return res.send("<script>alert('DB 오류');history.back();</script>");
        }
        if (rows[0].PILLBOX_NUM) {
            return res.send("<script>alert('이미 약통이 등록되어 있습니다.');history.back();</script>");
        }
        // 여기서 checkSql 실행
        // 이미 다른 시니어가 사용 중인지 확인
        const checkSql = `
            SELECT SENIOR_ID
            FROM TB_SENIOR
            WHERE PILLBOX_NUM = ?
            AND SENIOR_ID <> ?`;

        conn.query(checkSql, [pillboxNum, seniorId], (err, rows) => {

            if (err) {
                console.log(err);
                return res.send("<script>alert('DB 오류가 발생했습니다.');history.back();</script>");
            }

            if (rows.length > 0) {
                return res.send("<script>alert('이미 등록된 약통 번호입니다.');history.back();</script>");
            }

            const updateSql = `
                UPDATE TB_SENIOR
                SET PILLBOX_NUM = ?
                WHERE SENIOR_ID = ?`;

            conn.query(updateSql, [pillboxNum, seniorId], (err, result) => {

                if (err) {
                    console.log(err);
                    return res.send("<script>alert('약통 등록에 실패했습니다.');history.back();</script>");
                }

                if (result.affectedRows === 0) {
                    return res.send("<script>alert('시니어 정보를 찾을 수 없습니다.');history.back();</script>");
                }

                return res.send(`
                    <script>
                        alert('약통 등록이 완료되었습니다.');
                        location.href='/user/senior_service/senior_about';
                    </script>
                `);
            });
        });
    });
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
router.post("/sendEmailCode", (req, res) => {

    const { id, name, email, role } = req.body;

    // 회원가입에서는 id,name,role이 없음 → 기존 방식 사용
    if (!id && !name && !role) {
        return sendEmail(email, req, res);
    }

    // 보호대상 등록에서는 회원 확인 후 메일 발송
    const checkSql = `
        SELECT MEM_ID
        FROM TB_MEMBER
        WHERE MEM_ID = ?
          AND MEM_NAME = ?
          AND MEM_EMAIL = ?
          AND MEM_ST = ?
    `;

    conn.query(checkSql, [id, name, email, role], (err, rows) => {
        if (err) {
            console.log(err);
            return res.json({
                success: false,
                message: "DB 오류"
            });
        }

        if (rows.length === 0) {
            return res.json({
                success: false,
                message: "회원 정보를 찾을 수 없습니다."
            });
        }

        sendEmail(email, req, res);

    });
});

// 인증번호 발송
async function sendEmail(email, req, res) {

    const code = Math.floor(100000 + Math.random() * 900000).toString();

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
                <p>5분 안에 입력해주세요.</p> `
        });

        res.json({
            success: true
        });
    } catch (err) {
        console.log(err);

        res.json({
            success: false,
            message: "메일 발송 실패"
        });
    }
}

// 이메일 인증번호 확인
router.post("/verifyEmailCode", (req, res) => {

    const { email, code } = req.body;

    if (
        req.session.email === email &&
        req.session.emailCode === code
    ) {
        req.session.emailVerified = true;
        return res.json({
            success: true
        });
    }

    return res.json({
        success: false
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

// 사용자 메인 대시보드 get
router.get('/user/user_dashboard/main_dashboard', isLoggedIn, (req, res) => {
    let sql;
    let params;

    // 보호자
    if (req.session.user.role === "P") {

        sql = `
            SELECT PILLBOX_NUM
            FROM TB_SENIOR
            WHERE MEM_ID = ?
        `;
        params = [req.session.user.id];

    }
    // 시니어
    else if (req.session.user.role === "S") {

        sql = `
            SELECT PILLBOX_NUM
            FROM TB_SENIOR
            WHERE SENIOR_ID = ?
        `;
        params = [req.session.user.id];

    }
    // 관리자
    else {
        return res.redirect("/");
    }

    conn.query(sql, params, (err, rows) => {

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        if(rows.length===0){
            return res.render("user/user_service/no-pillbox",{
                title:"약통 미등록 — 복약안심서비스"
            });
        }

        const seniorSql=`
            SELECT
                SENIOR_ID,
                SENIOR_NAME,
                PILLBOX_NUM
            FROM TB_SENIOR
            WHERE MEM_ID=?
            ORDER BY SENIOR_NAME
        `;

        conn.query(seniorSql,[req.session.user.id],(err,seniorRows)=>{

            if(err){
                console.log(err);
                return res.send("DB 오류");
            }

            if(seniorRows.length===0){
                return res.send("보호대상이 없습니다.");
            }

            const selectedSeniorId=
                req.query.senior || seniorRows[0].SENIOR_ID;

            const currentSenior=
                seniorRows.find(s=>s.SENIOR_ID===selectedSeniorId)
                || seniorRows[0];

            const todaySql=`
                SELECT
                    MS.TAKING_TYPE,
                    MS.TAKING_TIME,
                    SC.TAKING_YN,
                    SC.TAKEN_TIME
                FROM TB_MEDICINE_SCHEDULE MS
                LEFT JOIN TB_SCHEDULE SC
                ON MS.MEDI_SCHE_CD=SC.MEDI_SCHE_CD
                AND SC.TAKING_DATE=CURDATE()
                WHERE MS.SENIOR_ID=?
                AND MS.USE_YN='Y'
                ORDER BY MS.TAKING_TIME
                `;

                conn.query(todaySql,[selectedSeniorId],(err,todayRows)=>{

                    if(err){
                        console.log(err);
                        return res.send("DB 오류");
                    }

                    const today={
                        morning:"⏳ 대기중",
                        lunch:"⏳ 대기중",
                        dinner:"⏳ 대기중",
                        bedtime:"⏳ 대기중"
                    };

                    const schedule=[];

                    todayRows.forEach(row=>{

                        let text="⏳ 대기중";
                        let status="plan";

                        if(row.TAKING_YN==="Y"){
                            text="✅";
                            status="ok";
                        }else if(row.TAKING_YN==="N"){
                            text="❌";
                            status="warn";
                        }

                        switch(row.TAKING_TYPE){
                            case "아침":
                                today.morning=text;
                                break;
                            case "점심":
                                today.lunch=text;
                                break;
                            case "저녁":
                                today.dinner=text;
                                break;
                            case "취침 전":
                                today.bedtime=text;
                                break;
                        }

                        schedule.push({
                            time:row.TAKING_TIME.toString().substring(0,5),
                            meal:row.TAKING_TYPE,
                            status
                        });

                    });

                    const weeklySql=`
                        SELECT
                            TAKING_DATE,
                            TAKING_TYPE,
                            TAKING_YN
                        FROM TB_SCHEDULE
                        WHERE SENIOR_ID=?
                        AND YEARWEEK(TAKING_DATE,1)=YEARWEEK(CURDATE(),1)
                        ORDER BY TAKING_DATE
                        `;

                        conn.query(weeklySql,[selectedSeniorId],(err,weekRows)=>{

                            if(err){
                                console.log(err);
                                return res.send("DB 오류");
                            }

                            let total=0;
                            let success=0;
                            let miss=0;

                            const takenDays=new Set();

                            weekRows.forEach(row=>{

                                total++;

                                if(row.TAKING_YN==="Y"){
                                    success++;
                                    takenDays.add(
                                        row.TAKING_DATE.toISOString().slice(0,10)
                                    );
                                }else{
                                    miss++;
                                }

                            });

                            const avgRate=
                                total===0
                                ?0
                                :Math.round(success/total*100);

                            const week={
                                월:{label:"월"},
                                화:{label:"화"},
                                수:{label:"수"},
                                목:{label:"목"},
                                금:{label:"금"},
                                토:{label:"토"},
                                일:{label:"일"}
                            };

                            Object.values(week).forEach(day=>{
                                day.morning="unset";
                                day.lunch="unset";
                                day.dinner="unset";
                                day.bedtime="unset";
                            });

                            const dayNames=[
                                "일","월","화","수","목","금","토"
                            ];

                            weekRows.forEach(row=>{

                                const day=
                                    dayNames[
                                        new Date(row.TAKING_DATE).getDay()
                                    ];

                                if(!week[day]) return;

                                const state=
                                    row.TAKING_YN==="Y"
                                    ?"done"
                                    :"missed";

                                switch(row.TAKING_TYPE){

                                    case "아침":
                                        week[day].morning=state;
                                        break;

                                    case "점심":
                                        week[day].lunch=state;
                                        break;

                                    case "저녁":
                                        week[day].dinner=state;
                                        break;

                                    case "취침 전":
                                        week[day].bedtime=state;
                                        break;
                                }

                            });

                            Object.values(week).forEach(day=>{

                                let count=0;
                                let ok=0;

                                ["morning","lunch","dinner","bedtime"].forEach(meal=>{

                                    if(day[meal]!=="unset"){
                                        count++;
                                    }

                                    if(day[meal]==="done"){
                                        ok++;
                                    }

                                });

                                day.rate=
                                    count===0
                                    ?null
                                    :Math.round(ok/count*100);

                            });

                            const weekly={

                                avgRate,
                                takenDays:takenDays.size,
                                missedCount:miss,

                                table:{
                                    range:"이번주",
                                    days:[
                                        week.월,
                                        week.화,
                                        week.수,
                                        week.목,
                                        week.금,
                                        week.토,
                                        week.일
                                    ]
                                }

                            };

                        const sensorSql=`
                            SELECT
                                PS.POWER_STATUS,
                                PS.LAST_HEARTBEAT_AT,
                                PS.UPDATED_AT,
                                (
                                    SELECT LOG_TYPE
                                    FROM TB_PILLBOX_LOG
                                    WHERE SENIOR_ID=?
                                    ORDER BY LOGGED_AT DESC
                                    LIMIT 1
                                ) AS LAST_LOG,
                                (
                                    SELECT LOGGED_AT
                                    FROM TB_PILLBOX_LOG
                                    WHERE SENIOR_ID=?
                                    ORDER BY LOGGED_AT DESC
                                    LIMIT 1
                                ) AS LAST_TIME
                            FROM TB_PILLBOX_STATUS PS
                            WHERE SENIOR_ID=?
                            `;

                        conn.query(sensorSql,
                        [
                            selectedSeniorId,
                            selectedSeniorId,
                            selectedSeniorId
                        ],
                        (err,sensorRows)=>{

                            if(err){
                                console.log(err);
                                return res.send("DB 오류");
                            }

                            let sensor={
                                lidOpen:false,
                                dbSync:false,
                                updatedAt:"-",
                                lastSync:"-",
                                lastDetected:"-"
                            };

                            if(sensorRows.length){

                                const row=sensorRows[0];

                                sensor.lidOpen=row.LAST_LOG==="OPEN";
                                sensor.dbSync=row.POWER_STATUS==="Y";

                                sensor.updatedAt=row.UPDATED_AT
                                    ?row.UPDATED_AT.toLocaleString("ko-KR")
                                    :"-";

                                sensor.lastSync=row.LAST_HEARTBEAT_AT
                                    ?row.LAST_HEARTBEAT_AT.toLocaleString("ko-KR")
                                    :"-";

                                sensor.lastDetected=row.LAST_TIME
                                    ?row.LAST_TIME.toLocaleString("ko-KR")
                                    :"-";
                            }

                            const alertSql=`
                            SELECT
                                A.ALERT_TYPE,
                                A.ALERT_MSG,
                                A.ALERT_TIME,
                                A.IS_RECEIVED,
                                S.SENIOR_NAME
                            FROM TB_ALERT A
                            JOIN TB_SENIOR S
                            ON A.SENIOR_ID=S.SENIOR_ID
                            WHERE A.SENIOR_ID=?
                            ORDER BY A.ALERT_TIME DESC
                            LIMIT 10
                            `;

                        conn.query(alertSql,[selectedSeniorId],(err,alerts)=>{

                            if(err){
                                console.log(err);
                                return res.send("DB 오류");
                            }

                            alerts.forEach(a=>{

                                if(a.ALERT_TYPE==="TAKEN"){
                                    a.className="ok";
                                }else if(a.ALERT_TYPE==="WARN"){
                                    a.className="warn";
                                }else{
                                    a.className="late";
                                }

                            });

                            res.render("user/user_dashboard/main_dashboard",{

                                title:"대시보드 — 복약안심서비스",

                                user:req.session.user,

                                seniorList:seniorRows,
                                selectedSenior:selectedSeniorId,

                                currentSenior,

                                today,
                                weekly,
                                schedule,
                                sensor,
                                alerts

                            });
                        });
                    });
                });
            });
        });
    });
});


// 로그인 안 한 사람 접근 차단
// TB_MEMBER, TB_SENIOR, TB_ALERT, TB_PILLBOX_LOG, TB_INQUIRY 기준으로 관리자 메인 현황을 만든다.
router.get("/admin/admin_dashboard/admin", async (req, res) => {
  if (!req.session.user || req.session.user.role !== "A") {
    return res.redirect("/");
  }

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM TB_MEMBER) AS totalMembers,
      (SELECT COUNT(*) FROM TB_MEMBER WHERE MEM_ST = 'P') AS parentMembers,
      (SELECT COUNT(*) FROM TB_MEMBER WHERE MEM_ST = 'S') AS seniorMembers,
      (SELECT COUNT(*) FROM TB_MEMBER WHERE MEM_ST = 'A') AS adminMembers,

      (SELECT COUNT(*)
       FROM TB_ALERT
       WHERE IS_RECEIVED = 'N') AS uncheckedAlertCount,

      (SELECT COUNT(*)
        FROM TB_SENIOR S
        LEFT JOIN TB_PILLBOX_STATUS PS
        ON PS.PILLBOX_NUM = S.PILLBOX_NUM
        WHERE S.PILLBOX_NUM IS NOT NULL
        AND S.PILLBOX_NUM <> ''
        AND (
            PS.LAST_HEARTBEAT_AT IS NULL
            OR PS.LAST_HEARTBEAT_AT < DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        )
      ) AS offlinePillboxCount,

      (SELECT COUNT(*)
       FROM TB_INQUIRY
       WHERE INQUIRY_STATUS <> '완료') AS pendingInquiryCount
  `;

  const recentMembersSql = `
    SELECT
      MEM_ID AS id,
      MEM_NAME AS name,
      MEM_ST AS type,
      DATE_FORMAT(JOINED_AT, '%Y-%m-%d') AS joinedAt
    FROM TB_MEMBER
    ORDER BY JOINED_AT DESC
  `;

  try {
    const [[stats]] = await conn.promise().query(sql);
    const [recentMembers] = await conn.promise().query(recentMembersSql);

    res.render("admin/admin_dashboard/admin", {
      title: "관리자 대시보드",
      adminName: req.session.user.name || "관리자",
      stats,
      recentMembers,
      notices: [
        {
          title: "알림",
          content: `오늘 확인이 필요한 알림 ${stats.uncheckedAlertCount}건`,
        },
        {
          title: "기기 연결 상태",
          content: `오프라인 약 상자 ${stats.offlinePillboxCount}대`,
        },
        {
          title: "신규 문의",
          content: `확인 대기 문의 ${stats.pendingInquiryCount}건`,
        },
      ],
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("관리자 대시보드 조회 중 DB 오류가 발생했습니다.");
  }
});

// 보호자는 연결된 모든 보호대상자 ID와 약통 번호를 표시하고,
// 시니어는 보호자 ID와 본인 약통 번호를 표시한다.
router.get("/admin/admin_dashboard/members", async (req, res) => {
  const sql = `
    SELECT *
    FROM (
      SELECT
        M.MEM_ID AS id,
        M.MEM_NAME AS name,
        M.MEM_ST AS type,
        M.MEM_EMAIL AS email,
        M.MEM_CONTACT AS contact,
        DATE_FORMAT(M.JOINED_AT, '%Y-%m-%d') AS joinedAt,
        IFNULL(M.MEM_ADDR, '') AS address,
        CASE
          WHEN M.MEM_ST = 'P' THEN
            IFNULL(
              NULLIF(
                GROUP_CONCAT(
                  DISTINCT CONCAT(
                    '보호대상: ',
                    S.SENIOR_ID,
                    ' / 약통: ',
                    IFNULL(NULLIF(S.PILLBOX_NUM, ''), '미등록')
                  )
                  ORDER BY S.SENIOR_ID
                  SEPARATOR ', '
                ),
                ''
              ),
              '보호대상: 미등록 / 약통: 미등록'
            )

          WHEN M.MEM_ST = 'S' THEN
            CONCAT(
              '대상자: ',
              M.MEM_ID,
              ' / 보호자: ',
              IFNULL(NULLIF(SELF_S.MEM_ID, ''), '미등록'),
              ' / 약통: ',
              IFNULL(NULLIF(SELF_S.PILLBOX_NUM, ''), '미등록')
            )

          ELSE
            CONCAT('회원: ', M.MEM_ID)
        END AS memo
      FROM TB_MEMBER M
      LEFT JOIN TB_SENIOR S
        ON S.MEM_ID = M.MEM_ID
      LEFT JOIN TB_SENIOR SELF_S
        ON SELF_S.SENIOR_ID = M.MEM_ID
      WHERE M.MEM_ST IN ('P', 'S')
      GROUP BY
        M.MEM_ID,
        M.MEM_NAME,
        M.MEM_ST,
        M.MEM_EMAIL,
        M.MEM_CONTACT,
        M.JOINED_AT,
        M.MEM_ADDR,
        SELF_S.MEM_ID,
        SELF_S.PILLBOX_NUM

      UNION ALL

      SELECT
        S.SENIOR_ID AS id,
        S.SENIOR_NAME AS name,
        'S' AS type,
        S.SENIOR_EMAIL AS email,
        S.SENIOR_CONTACT AS contact,
        DATE_FORMAT(S.JOINED_AT, '%Y-%m-%d') AS joinedAt,
        IFNULL(S.SENIOR_ADDR, '') AS address,
        CONCAT(
          '대상자: ',
          S.SENIOR_ID,
          ' / 보호자: ',
          IFNULL(NULLIF(S.MEM_ID, ''), '미등록'),
          ' / 약통: ',
          IFNULL(NULLIF(S.PILLBOX_NUM, ''), '미등록')
        ) AS memo
      FROM TB_SENIOR S
      WHERE NOT EXISTS (
        SELECT 1
        FROM TB_MEMBER M
        WHERE M.MEM_ID = S.SENIOR_ID
      )
    ) X
    ORDER BY joinedAt DESC, type, name
  `;

  try {
    const [members] = await conn.promise().query(sql);

    res.render("admin/admin_dashboard/members", {
      title: "회원관리",
      pageTitle: "회원관리",
      adminName: req.session.user?.name || "관리자",
      members,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("회원 목록 조회 중 DB 오류가 발생했습니다.");
  }
});

// 관리자 약 상자 관리 페이지
// TB_PILLBOX_STATUS.LAST_HEARTBEAT_AT 기준으로 약상자 ON/OFF를 판단한다.
router.get("/admin/admin_dashboard/medicine_boxes", async (req, res) => {
  const sql = `
    SELECT
      S.PILLBOX_NUM AS id,
      S.SENIOR_NAME AS owner,

      CASE
        WHEN PS.LAST_HEARTBEAT_AT >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        THEN 'ON'
        ELSE 'OFF'
      END AS powerStatus,

    DATE_FORMAT(PS.LAST_HEARTBEAT_AT, '%Y-%m-%d %H:%i') AS lastHeartbeatAt,

    L.LOG_TYPE AS logType,

      COUNT(M.MEDI_SCHE_CD) AS activeScheduleCount
    FROM TB_SENIOR S

    LEFT JOIN TB_PILLBOX_STATUS PS
      ON PS.PILLBOX_NUM = S.PILLBOX_NUM

    LEFT JOIN (
      SELECT L1.*
      FROM TB_PILLBOX_LOG L1
      INNER JOIN (
        SELECT SENIOR_ID, MAX(LOGGED_AT) AS LOGGED_AT
        FROM TB_PILLBOX_LOG
        GROUP BY SENIOR_ID
      ) L2 ON L2.SENIOR_ID = L1.SENIOR_ID
         AND L2.LOGGED_AT = L1.LOGGED_AT
    ) L ON L.SENIOR_ID = S.SENIOR_ID

    LEFT JOIN TB_MEDICINE_SCHEDULE M
      ON M.SENIOR_ID = S.SENIOR_ID
      AND M.USE_YN = 'Y'

    WHERE S.PILLBOX_NUM IS NOT NULL
      AND S.PILLBOX_NUM <> ''

    GROUP BY
    S.SENIOR_ID,
    S.PILLBOX_NUM,
    S.SENIOR_NAME,
    PS.LAST_HEARTBEAT_AT,
    L.LOG_TYPE

    ORDER BY S.PILLBOX_NUM
  `;

  try {
    const [rows] = await conn.promise().query(sql);

    const medicineBoxes = rows.map((row) => {
      const logType = row.logType || "";
      const isOpen = logType.includes("OPEN") || logType.includes("열림");

      return {
        id: row.id,
        owner: row.owner,
        status: row.powerStatus,
        isOpen,
        pillStatus: "미확인",
        lastPillCheckedAt: "-",
        lastUpdated: row.lastHeartbeatAt || "-",
        };
    });

    res.render("admin/admin_dashboard/medicine_boxes", {
      title: "약 상자 관리",
      pageTitle: "약 상자 관리",
      adminName: req.session.user?.name || "관리자",
      medicineBoxes,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("약상자 목록 조회 중 DB 오류가 발생했습니다.");
  }
});


router.post("/api/pillbox/heartbeat", (req, res) => {
  const { pillboxNum, seniorId } = req.body;
  const ipAddr =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;

  if (!pillboxNum || !seniorId) {
    return res.status(400).json({
      success: false,
      message: "pillboxNum, seniorId가 필요합니다.",
    });
  }

  const sql = `
    INSERT INTO TB_PILLBOX_STATUS
      (PILLBOX_NUM, SENIOR_ID, POWER_STATUS, LAST_HEARTBEAT_AT, IP_ADDR)
    SELECT
      S.PILLBOX_NUM,
      S.SENIOR_ID,
      'Y',
      NOW(),
      ?
    FROM TB_SENIOR S
    WHERE S.SENIOR_ID = ?
      AND S.PILLBOX_NUM = ?
    ON DUPLICATE KEY UPDATE
      SENIOR_ID = VALUES(SENIOR_ID),
      POWER_STATUS = 'Y',
      LAST_HEARTBEAT_AT = NOW(),
      IP_ADDR = VALUES(IP_ADDR)
  `;

  conn.query(sql, [ipAddr, seniorId, pillboxNum], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ success: false });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "등록된 시니어/약통 정보를 찾을 수 없습니다.",
      });
    }

    res.json({ success: true });
  });
});

// 관리자 알림 메시지 페이지
// 알림 메시지 화면에서는 회원 문의(TB_INQUIRY)만 표시한다.
router.get("/admin/admin_dashboard/messages", async (req, res) => {
  const sql = `
    SELECT
      I.INQUIRY_CD AS id,
      '문의' AS type,
      I.INQUIRY_TITLE AS title,
      M.MEM_NAME AS sender,
      CONCAT(
        CASE M.MEM_ST
          WHEN 'P' THEN '보호자'
          WHEN 'S' THEN '대상자'
          WHEN 'A' THEN '관리자'
          ELSE '회원'
        END,
        ' / 회원ID: ',
        I.MEM_ID,
        ' / 기기ID: ',
        IFNULL(NULLIF(COALESCE(TARGET_S.PILLBOX_NUM, MEMBER_S.PILLBOX_NUM), ''), '미등록')
      ) AS memberId,

      CASE
        WHEN I.INQUIRY_STATUS = '완료' THEN '완료'
        ELSE '확인 필요'
      END AS status,

      DATE_FORMAT(I.CREATED_AT, '%Y-%m-%d %H:%i') AS createdAt,
      I.INQUIRY_CONTENT AS content
    FROM TB_INQUIRY I
    JOIN TB_MEMBER M
      ON M.MEM_ID = I.MEM_ID

    -- 문의가 특정 대상자와 연결된 경우, 그 대상자의 약통 번호를 가져온다.
    LEFT JOIN TB_SENIOR TARGET_S
      ON TARGET_S.SENIOR_ID = I.SENIOR_ID

    -- 문의 작성자가 시니어 계정인 경우, 작성자 본인의 약통 번호를 가져온다.
    LEFT JOIN TB_SENIOR MEMBER_S
      ON MEMBER_S.SENIOR_ID = I.MEM_ID

    ORDER BY I.CREATED_AT DESC
    LIMIT 100
  `;

  try {
    const [messages] = await conn.promise().query(sql);

    res.render("admin/admin_dashboard/messages", {
      title: "알림메시지",
      pageTitle: "알림메시지",
      adminName: req.session.user?.name || "관리자",
      messages,
    });
  } catch (err) {
    
    console.log(err);
    res.status(500).send("문의 목록 조회 중 DB 오류가 발생했습니다.");
  }
});

// 관리자 공지사항 관리
router.get("/admin/admin_update_announce", isLoggedIn, (req, res) => {

    const sql = `
        SELECT *
        FROM TB_NOTICE
        WHERE IS_VISIBLE = 'Y'
        ORDER BY CREATED_AT DESC
    `;

    conn.query(sql, (err, notices) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        res.render("admin/admin_update_announce", {
            title: "공지사항 수정",
            adminName: req.session.user.name,
            notices
        });
    });
});

// 공지사항 등록
router.post("/admin/notice/add", isLoggedIn, (req, res) => {

    const { category, title, content } = req.body;

    const sql = `
        INSERT INTO TB_NOTICE
        (
            MEM_ID,
            CATEGORY,
            TITLE,
            CONTENT
        )
        VALUES (?, ?, ?, ?)
    `;

    conn.query(
        sql,
        [
            req.session.user.id,
            category,
            title,
            content
        ],
        (err) => {

            if (err) {
                console.log(err);
                return res.status(500).json({ success: false });
            }

            res.json({ success: true });

        }
    );
});

// 공지사항 수정
router.post("/admin/notice/update/:id", isLoggedIn, (req, res) => {

    const { category, title, content } = req.body;

    const sql = `
        UPDATE TB_NOTICE
        SET
            CATEGORY = ?,
            TITLE = ?,
            CONTENT = ?
        WHERE ANN_ID = ?
    `;

    conn.query(
        sql,
        [
            category,
            title,
            content,
            req.params.id
        ],
        (err) => {

            if (err) {
                console.log(err);
                return res.status(500).json({ success: false });
            }

            res.json({ success: true });

        }
    );
});

// 공지 수정 페이지
router.get("/admin/admin_announce/:id", isLoggedIn, (req, res) => {

    const sql = `
        SELECT *
        FROM TB_NOTICE
        WHERE ANN_ID = ?
    `;

    conn.query(sql, [req.params.id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        if (rows.length === 0) {
            return res.send("공지사항이 존재하지 않습니다.");
        }

        res.render("admin/admin_announce", {
            title: "공지사항 수정",
            adminName: req.session.user.name,
            notice: rows[0]
        });

    });

});

// 공지사항 삭제
router.post("/admin/notice/delete", isLoggedIn, (req, res) => {
    const ids = req.body.ids;

    if (!ids || ids.length === 0) {
        return res.json({ success: false });
    }

    const sql = `
        UPDATE TB_NOTICE
        SET IS_VISIBLE='N'
        WHERE ANN_ID IN (?)
    `;

    conn.query(
        sql,
        [ids],
        (err) => {

            if (err) {
                console.log(err);
                return res.status(500).json({ success: false });
            }

            res.json({ success: true });

        }
    );
});

// 아이디 찾기
router.get("/findId", (req, res) => {
    res.render("login/findId");
});

// 비밀번호 변경
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
        name,
        email
    } = req.body;

    const memId = req.session.user.id;

    const checkMemberSql = `
        SELECT *
        FROM TB_MEMBER
        WHERE MEM_ID = ?
        AND MEM_NAME = ?
        AND MEM_EMAIL = ?
        AND MEM_ST = 'S'
        `;

    conn.query(checkMemberSql, [seniorId, name, email], async (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('DB 오류가 발생했습니다.');history.back();</script>");
        }

        if (rows.length === 0) {
            return res.send("<script>alert('회원 정보를 찾을 수 없습니다.');history.back();</script>");
        }

        // 이메일 인증 확인
        if (
            !req.session.emailVerified ||
            req.session.email !== email
        ) {
            return res.send("<script>alert('이메일 인증을 완료해주세요.');history.back();</script>");
        }

        // 자기 자신 등록 방지
        if (seniorId === memId) {
            return res.send("<script>alert('본인은 등록할 수 없습니다.');history.back();</script>");
        }

        const duplicateSql = `
            SELECT MEM_ID
            FROM TB_SENIOR
            WHERE SENIOR_ID = ?
        `;

        conn.query(duplicateSql, [seniorId], (err2, result) => {

            if (err2) {
                console.log(err2);
                return res.send("<script>alert('DB 오류가 발생했습니다.');history.back();</script>");
            }

            if (result.length === 0) {
                return res.send("<script>alert('시니어 정보를 찾을 수 없습니다.');history.back();</script>");
            }

            if (result[0].MEM_ID === memId) {
                return res.send("<script>alert('이미 등록한 보호대상입니다.');history.back();</script>");
            }

            if (result[0].MEM_ID && result[0].MEM_ID !== memId) {
                return res.send("<script>alert('이미 다른 보호자가 등록되어 있습니다.');history.back();</script>");
            }

            const updateSql = `
                UPDATE TB_SENIOR
                SET MEM_ID = ?
                WHERE SENIOR_ID = ?
            `;

            conn.query(updateSql, [memId, seniorId], (err3) => {

                if (err3) {
                    console.log(err3);
                    return res.send("<script>alert('등록 실패');history.back();</script>");
                }

                delete req.session.emailCode;
                delete req.session.email;
                delete req.session.emailVerified;

                return res.send(`
                    <script>
                        alert('보호대상 등록이 완료되었습니다.');
                        location.href='/user/user_info/protected';
                    </script>
                `);
            });
        });
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

// 시니어 기본 정보 수정 POST
router.post("/user/user_info/protected/info/update/:id", (req, res) => {

    const seniorId = req.params.id;

    const {
        SENIOR_NAME,
        SENIOR_EMAIL,
        SENIOR_CONTACT,
        SENIOR_ADDR,
        PILLBOX_NUM
    } = req.body;

    const sql = `
        UPDATE TB_SENIOR
        SET
            SENIOR_NAME = ?,
            SENIOR_EMAIL = ?,
            SENIOR_CONTACT = ?,
            SENIOR_ADDR = ?,
            PILLBOX_NUM = ?
        WHERE SENIOR_ID = ?
    `;

    conn.query(
        sql,
        [
            SENIOR_NAME,
            SENIOR_EMAIL,
            SENIOR_CONTACT,
            SENIOR_ADDR,
            PILLBOX_NUM,
            seniorId
        ],
        (err) => {

            if (err) {
                console.log(err);
                return res.redirect("back");
            }

            res.redirect("/user/user_info/protected");
        }
    );
});

// 시니어 복약 스케줄 수정 POST
router.post("/user/user_info/protected/schedule/update/:id", (req, res) => {

    const seniorId = req.params.id;

    const {

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

    // 기존 스케줄 종료
    const endSql = `
        UPDATE TB_MEDICINE_SCHEDULE
        SET
            USE_YN='N',
            END_DATE=CURDATE(),
            UPDATED_AT=NOW()
        WHERE SENIOR_ID=?
        AND USE_YN='Y'
    `;

    conn.query(endSql, [seniorId], (err) => {

        if (err) {
            console.log(err);
            return res.redirect("back");
        }

        const schedules = [];

        if (morningPillbox && morningTime) {
            schedules.push([
                seniorId,
                morningPillbox,
                morningType,
                morningTime
            ]);
        }

        if (lunchPillbox && lunchTime) {
            schedules.push([
                seniorId,
                lunchPillbox,
                lunchType,
                lunchTime
            ]);
        }

        if (dinnerPillbox && dinnerTime) {
            schedules.push([
                seniorId,
                dinnerPillbox,
                dinnerType,
                dinnerTime
            ]);
        }

        if (nightPillbox && nightTime) {
            schedules.push([
                seniorId,
                nightPillbox,
                nightType,
                nightTime
            ]);
        }

        if (schedules.length === 0) {
            return res.redirect("/user/user_info/protected");
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
            (
                ?,
                ?,
                ?,
                ?,
                CURDATE()
            )
        `;

        let count = 0;

        schedules.forEach(schedule => {

            conn.query(insertSql, schedule, (err2) => {

                if (err2) {
                    console.log(err2);
                }

                count++;

                if (count === schedules.length) {
                    res.redirect("/user/user_info/protected");
                }
            });
        });
    });
});

// 시니어 정보 삭제(연결 해제)
router.get("/user/user_info/protected/delete/:seniorId", isLoggedIn, (req, res) => {

    const seniorId = req.params.seniorId;
    const memId = req.session.user.id;

    const updateSql = `
        UPDATE TB_SENIOR
        SET MEM_ID = NULL
        WHERE SENIOR_ID = ?
          AND MEM_ID = ?
    `;

    conn.query(updateSql, [seniorId, memId], (err, result) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('삭제 실패');history.back();</script>");
        }

        if (result.affectedRows === 0) {
            return res.send("<script>alert('삭제할 대상자가 없습니다.');history.back();</script>");
        }

        res.send(`
            <script>
                alert('보호대상 연결이 해제되었습니다.');
                location.href='/user/user_info/protected';
            </script>
        `);

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
        (err, result) => {

            if (err) {
                console.log(err);
                return res.send("<script>alert('수정 실패');history.back();</script>");
            }

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

// 공지사항 get
router.get('/index/index_announce', (req, res) => {

    const noticeSql = `
        SELECT
            ANN_ID,
            CATEGORY,
            TITLE,
            CREATED_AT
        FROM TB_NOTICE
        WHERE IS_VISIBLE = 'Y'
        ORDER BY CREATED_AT DESC
    `;

    conn.query(noticeSql, (noticeErr, notices) => {

        if (noticeErr) {
            console.log(noticeErr);
            return res.send("DB 오류");
        }

        // 로그인 안 한 경우
        if (!req.session.user) {
            return res.render("index/index_announce", {
                title: "공지사항",
                notices,
                user: null,
                member: null
            });
        }

        // 로그인한 경우 회원구분 조회
        const memberSql = `
            SELECT MEM_ST
            FROM TB_MEMBER
            WHERE MEM_ID = ?
        `;

        conn.query(memberSql, [req.session.user.id], (memberErr, rows) => {

            if (memberErr) {
                console.log(memberErr);
                return res.send("DB 오류");
            }

            res.render("index/index_announce", {
                title: "공지사항",
                notices,
                user: req.session.user,
                member: rows[0]
            });
        });
    });
});

// 관리자 정보 수정 get
router.get("/admin/admin_update", (req, res) => {

    const sql = `
        SELECT *
        FROM TB_MEMBER
        WHERE MEM_ID = ?
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        if(rows.length===0){
            return res.redirect("/login");
        }

        res.render("admin/admin_update",{
            title:"관리자 정보 수정",
            member:rows[0]
        });
    });
});

// 관리자 정보 수정 post
router.post("/admin/admin_update", async (req,res)=>{

    const {

        adminName,
        adminPw,
        adminEmail,
        adminPhone,
        adminAddr

    } = req.body;

    const id=req.session.user.id;

    let sql;
    let params;

    if(adminPw.trim()!=""){

        const hash=await bcrypt.hash(adminPw,10);

        sql=`
        UPDATE TB_MEMBER
        SET
        MEM_NAME=?,
        MEM_PW=?,
        MEM_EMAIL=?,
        MEM_CONTACT=?,
        MEM_ADDR=?
        WHERE MEM_ID=?
        `;

        params=[
            adminName,
            hash,
            adminEmail,
            adminPhone,
            adminAddr,
            id
        ];

    }else{

        sql=`
        UPDATE TB_MEMBER
        SET
        MEM_NAME=?,
        MEM_EMAIL=?,
        MEM_CONTACT=?,
        MEM_ADDR=?
        WHERE MEM_ID=?
        `;

        params=[
            adminName,
            adminEmail,
            adminPhone,
            adminAddr,
            id
        ];
    }

    conn.query(sql, params, (err)=>{

        if(err){
            console.log(err);
            return res.send("<script>alert('수정 실패');history.back();</script>");
        }

        req.session.user.name=adminName;

        res.send(`
        <script>
        alert("수정되었습니다.");
        location.href="/admin/admin_dashboard/admin";
        </script>
        `);
    });
});

// 관리자 탈퇴
router.post("/admin/admin_delete",(req,res)=>{

    const sql=`
    DELETE
    FROM TB_MEMBER
    WHERE MEM_ID=?
    `;

    conn.query(sql,[req.session.user.id],(err)=>{

        if(err){
            console.log(err);
            return res.send("<script>alert('탈퇴 실패');history.back();</script>");
        }

        req.session.destroy(()=>{

            res.send(`
            <script>
            alert("탈퇴되었습니다.");
            location.href="/login";
            </script>
            `);

        });
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
router.get("/user/senior_info/senior_schedule", (req, res) => {

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
                "user/senior_info/senior_schedule",
                { seniors : rows }
            );
        }
    );
});

// 약 스케줄 등록 POST
router.post("/user/senior_info/senior_schedule", isLoggedIn, (req, res) => {

    const {
        seniorId,

        morningPillbox,
        morningTime,

        lunchPillbox,
        lunchTime,

        dinnerPillbox,
        dinnerTime,

        nightPillbox,
        nightTime

    } = req.body;

    const schedules = [];

    const addSchedule = (pillbox, time, type) => {

        // 둘 다 비어있으면 등록 안 함
        if (!pillbox && !time) return null;

        // 하나만 입력한 경우
        if (!pillbox || !time) {
            return `${type} 복약은 약통 번호와 시간을 모두 입력해주세요.`;
        }

        schedules.push([
            seniorId,
            pillbox,
            type,
            time
        ]);

        return null;
    };

    let error;

    error = addSchedule(morningPillbox, morningTime, "아침");
    if (error) return res.send(`<script>alert('${error}');history.back();</script>`);

    error = addSchedule(lunchPillbox, lunchTime, "점심");
    if (error) return res.send(`<script>alert('${error}');history.back();</script>`);

    error = addSchedule(dinnerPillbox, dinnerTime, "저녁");
    if (error) return res.send(`<script>alert('${error}');history.back();</script>`);

    error = addSchedule(nightPillbox, nightTime, "취침 전");
    if (error) return res.send(`<script>alert('${error}');history.back();</script>`);

    if (schedules.length === 0) {
        return res.send("<script>alert('최소 한 개 이상의 복약 스케줄을 등록해주세요.');history.back();</script>");
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
        (
            ?,
            ?,
            ?,
            ?,
            CURDATE()
        )
    `;

    let count = 0;

    schedules.forEach(schedule => {

        conn.query(insertSql, schedule, (err) => {

            if (err) {
                console.log(err);
                return res.send("<script>alert('등록 실패');history.back();</script>");
            }

            count++;

            if (count === schedules.length) {

                return res.send(`
                    <script>
                        alert('복약 스케줄 등록 완료');
                        location.href='/user/senior_service/senior_about';
                    </script>
                `);

            }

        });

    });

});

router.get('/user/senior_service/senior_about', (req, res) => {
  res.render('user/senior_service/senior_about', { title: '서비스 소개 — 복약안심서비스' });
});

router.post('/user/senior_service/senior_about', (req, res) => {

  res.render('user/senior_service/senior_about', { 
    title: '서비스 소개 — 복약안심서비스',
    user: req.session.user 
  });
});

router.get("/user/senior_info/senior_register", isLoggedIn, (req, res) => {

    res.render("user/senior_info/senior_register", {
        title: "대상자 등록",
        user: req.session.user
    });
});

// 보호자 등록 POST
router.post("/user/senior_info/senior_register", isLoggedIn, (req, res) => {

    const { guardianId, guardianName, email } = req.body;
    const seniorId = req.session.user.id;

    // 현재 시니어의 보호자 등록 여부 확인
    const seniorSql = `
        SELECT MEM_ID
        FROM TB_SENIOR
        WHERE SENIOR_ID = ?
    `;

    conn.query(seniorSql, [seniorId], (err, seniorRows) => {

        if (err) {
            console.log(err);
            return res.send("<script>alert('DB 오류가 발생했습니다.');history.back();</script>");
        }

        if (seniorRows.length === 0) {
            return res.send("<script>alert('시니어 정보를 찾을 수 없습니다.');history.back();</script>");
        }

        // 이미 보호자가 등록되어 있는 경우
        if (seniorRows[0].MEM_ID === guardianId) {
            return res.send(
                "<script>alert('이미 등록된 보호자입니다.');history.back();</script>"
            );
        }

        if (seniorRows[0].MEM_ID && seniorRows[0].MEM_ID !== guardianId) {
            return res.send(
                "<script>alert('이미 다른 보호자가 등록되어 있습니다.\\n변경은 계정 관리에서 가능합니다.');history.back();</script>"
            );
        }

        // 이메일 인증 확인
        if (
            !req.session.emailVerified ||
            req.session.email !== email
        ) {
            return res.send(
                "<script>alert('이메일 인증을 완료해주세요.');history.back();</script>"
            );
        }

        // 자기 자신 등록 방지
        if (guardianId === seniorId) {
            return res.send(
                "<script>alert('본인은 보호자로 등록할 수 없습니다.');history.back();</script>"
            );
        }

        // 보호자 정보 확인
        const guardianSql = `
            SELECT *
            FROM TB_MEMBER
            WHERE MEM_ID = ?
              AND MEM_NAME = ?
              AND MEM_EMAIL = ?
              AND MEM_ST = 'P'
        `;

        conn.query(
            guardianSql,
            [guardianId, guardianName, email],
            (err, guardianRows) => {

                if (err) {
                    console.log(err);
                    return res.send("<script>alert('DB 오류가 발생했습니다.');history.back();</script>");
                }

                // 보호자가 아니거나 정보가 일치하지 않는 경우
                if (guardianRows.length === 0) {
                    return res.send(
                        "<script>alert('보호자 정보를 찾을 수 없습니다.\\n보호자 아이디, 이름, 이메일을 다시 확인해주세요.');history.back();</script>"
                    );
                }

                // 보호자 등록
                const updateSql = `
                    UPDATE TB_SENIOR
                    SET MEM_ID = ?
                    WHERE SENIOR_ID = ?
                `;

                conn.query(
                    updateSql,
                    [guardianId, seniorId],
                    (err, result) => {

                        if (err) {
                            console.log(err);
                            return res.send("<script>alert('보호자 등록에 실패했습니다.');history.back();</script>");
                        }

                        if (result.affectedRows === 0) {
                            return res.send("<script>alert('보호자 등록에 실패했습니다.');history.back();</script>");
                        }

                        delete req.session.emailCode;
                        delete req.session.email;
                        delete req.session.emailVerified;

                        return res.send(`
                            <script>
                                alert('보호자가 성공적으로 등록되었습니다.');
                                location.href='/user/senior_service/senior_about';
                            </script>
                        `);
                    }

                );
            }
        );
    });
});

// 시니어 페이지 개인정보 관리
router.get("/user/senior_info/senior_settings", isLoggedIn, (req, res) => {

    const seniorId = req.session.user.id;

    // 시니어 정보 조회
    const seniorSql = `
        SELECT
            S.*,
            M.MEM_ST,
            M.JOINED_AT
        FROM TB_SENIOR S
        JOIN TB_MEMBER M
            ON S.SENIOR_ID = M.MEM_ID
        WHERE S.SENIOR_ID = ?
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

// 시니어 계정 정보 수정
router.post("/user/senior_info/senior_settings/update", isLoggedIn, (req, res) => {

    const {
        SENIOR_NAME,
        SENIOR_EMAIL,
        SENIOR_CONTACT,
        SENIOR_ADDR,
        PILLBOX_NUM
    } = req.body;

    // 1. TB_SENIOR 수정
    const seniorSql = `
        UPDATE TB_SENIOR
        SET
            SENIOR_NAME = ?,
            SENIOR_EMAIL = ?,
            SENIOR_CONTACT = ?,
            SENIOR_ADDR = ?,
            PILLBOX_NUM = ?
        WHERE SENIOR_ID = ?
    `;

    conn.query(
        seniorSql,
        [
            SENIOR_NAME,
            SENIOR_EMAIL,
            SENIOR_CONTACT,
            SENIOR_ADDR,
            PILLBOX_NUM || null,
            req.session.user.id
        ],
        (err) => {

            if (err) {
                console.log(err);
                return res.send("<script>alert('수정 실패');history.back();</script>");
            }

            // 2. TB_MEMBER 수정
            const memberSql = `
                UPDATE TB_MEMBER
                SET
                    MEM_NAME = ?,
                    MEM_EMAIL = ?,
                    MEM_CONTACT = ?,
                    MEM_ADDR = ?
                WHERE MEM_ID = ?
            `;

            conn.query(
                memberSql,
                [
                    SENIOR_NAME,
                    SENIOR_EMAIL,
                    SENIOR_CONTACT,
                    SENIOR_ADDR,
                    req.session.user.id
                ],
                (err2) => {

                    if (err2) {
                        console.log(err2);
                        return res.send("<script>alert('회원정보 수정 중 오류가 발생했습니다.');history.back();</script>");
                    }

                    // 세션 이름도 변경
                    req.session.user.name = SENIOR_NAME;

                    res.send(`
                        <script>
                            alert('회원정보가 수정되었습니다.');
                            location.href='/user/senior_info/senior_settings';
                        </script>
                    `);
                }
            );
        }
    );
});

// 태헌님 router 코드

// 복약 기록 페이지
router.get("/user/user_dashboard/dashboard_record", isLoggedIn, (req,res)=>{

    const selectedDate=req.query.date || new Date().toISOString().slice(0,10);

    const seniorSql=`
    SELECT
        SENIOR_ID,
        SENIOR_NAME
    FROM TB_SENIOR
    WHERE MEM_ID=?
    ORDER BY SENIOR_NAME
    `;

    conn.query(seniorSql,[req.session.user.id],(err,seniorRows)=>{

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        if(seniorRows.length===0){
            return res.send("등록된 보호대상이 없습니다.");
        }

        const selectedSeniorId=
            req.query.senior || seniorRows[0].SENIOR_ID;
        
        const recordSql=`
            SELECT
                SC.SCHE_CD,
                SC.TAKING_DATE,
                SC.TAKING_YN,
                SC.TAKEN_TIME,
                MS.TAKING_TIME,
                MS.TAKING_TYPE,
                MS.PILLBOX_ORDER,
                S.SENIOR_ID,
                S.SENIOR_NAME
            FROM TB_SCHEDULE SC
            JOIN TB_MEDICINE_SCHEDULE MS
            ON SC.MEDI_SCHE_CD=MS.MEDI_SCHE_CD
            AND SC.SENIOR_ID=MS.SENIOR_ID
            JOIN TB_SENIOR S
            ON SC.SENIOR_ID=S.SENIOR_ID
            WHERE SC.SENIOR_ID=?
            AND SC.TAKING_DATE=?
            ORDER BY MS.TAKING_TIME
            `;

        conn.query(recordSql,[selectedSeniorId,selectedDate],(err,rows)=>{

            if(err){
                console.log(err);
                return res.send("DB 오류");
            }

            const schedules=rows.map(r=>{

                let status="pending";
                let statusLabel="복용 예정";

                if(r.TAKING_YN==="Y"){
                    status="done";
                    statusLabel="복용 완료";
                }else if(r.TAKING_YN==="N"){
                    status="miss";
                    statusLabel="미복용";
                }

                return{
                    seniorId:r.SENIOR_ID,
                    seniorName:r.SENIOR_NAME,
                    takingDate:r.TAKING_DATE,
                    takingTime:r.TAKING_TIME.toString().substring(0,5),
                    takenTime:r.TAKEN_TIME
                        ?r.TAKEN_TIME.toString().substring(0,5)
                        :"",
                    pillboxOrder:r.PILLBOX_ORDER,
                    takingType:r.TAKING_TYPE,
                    status,
                    statusLabel
                };
            });

            const summary={
                total:schedules.length,
                done:schedules.filter(s=>s.status==="done").length,
                miss:schedules.filter(s=>s.status==="miss").length,
                pending:schedules.filter(s=>s.status==="pending").length
            };
            res.render("user/user_dashboard/dashboard_record",{
                title:"복약 기록",
                user:req.session.user,
                selectedDate,
                schedules,
                summary,
                seniorOptions:seniorRows,
                selectedSeniorId
            });
        });
    });
});

// 실시간 상태 페이지
router.get("/user/user_dashboard/dashboard_stat", isLoggedIn, (req,res)=>{

    const seniorSql=`
    SELECT
        SENIOR_ID,
        SENIOR_NAME,
        PILLBOX_NUM
    FROM TB_SENIOR
    WHERE MEM_ID=?
    ORDER BY SENIOR_NAME
    `;

    conn.query(seniorSql,[req.session.user.id],(err,seniorRows)=>{

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        if(seniorRows.length===0){
            return res.send("등록된 보호대상이 없습니다.");
        }

        const selectedSeniorId=
            req.query.senior || seniorRows[0].SENIOR_ID;
        const selectedSenior=
            seniorRows.find(s=>s.SENIOR_ID===selectedSeniorId)
            || seniorRows[0];
        
        const summarySql=`
            SELECT

                COUNT(DISTINCT S.SENIOR_ID) AS total,

                COUNT(DISTINCT CASE
                    WHEN NOT EXISTS(
                        SELECT 1
                        FROM TB_SCHEDULE SC
                        WHERE SC.SENIOR_ID=S.SENIOR_ID
                        AND SC.TAKING_DATE=CURDATE()
                        AND SC.TAKING_YN='N'
                    )
                    THEN S.SENIOR_ID
                END) AS ok,

                COUNT(DISTINCT CASE
                    WHEN EXISTS(
                        SELECT 1
                        FROM TB_SCHEDULE SC
                        WHERE SC.SENIOR_ID=S.SENIOR_ID
                        AND SC.TAKING_DATE=CURDATE()
                        AND SC.TAKING_YN IS NULL
                    )
                    THEN S.SENIOR_ID
                END) AS warn,

                COUNT(DISTINCT CASE
                    WHEN EXISTS(
                        SELECT 1
                        FROM TB_SCHEDULE SC
                        WHERE SC.SENIOR_ID=S.SENIOR_ID
                        AND SC.TAKING_DATE=CURDATE()
                        AND SC.TAKING_YN='N'
                    )
                    THEN S.SENIOR_ID
                END) AS late

            FROM TB_SENIOR S

            WHERE S.MEM_ID=?;
            `;

            conn.query(summarySql,[req.session.user.id],(err,summaryRows)=>{

                if(err){
                    console.log(err);
                    return res.send("DB 오류");
                }

                const summary=summaryRows[0];

                const statusSql=`
                    SELECT
                        S.SENIOR_ID,
                        S.SENIOR_NAME,
                        S.PILLBOX_NUM,

                        COUNT(SC.SCHE_CD) AS todayTotal,

                        SUM(CASE
                            WHEN SC.TAKING_YN='Y'
                            THEN 1
                            ELSE 0
                        END) AS todayDone,

                        SUM(CASE
                            WHEN SC.TAKING_YN='N'
                            THEN 1
                            ELSE 0
                        END) AS todayMissed,

                        AL.ALERT_TYPE,
                        AL.ALERT_TIME,

                        CASE
                            WHEN SUM(CASE WHEN SC.TAKING_YN='N' THEN 1 ELSE 0 END)>0
                                THEN 'late'
                            WHEN SUM(CASE WHEN SC.TAKING_YN IS NULL THEN 1 ELSE 0 END)>0
                                THEN 'warn'
                            ELSE 'ok'
                        END AS state

                    FROM TB_SENIOR S

                    LEFT JOIN TB_SCHEDULE SC
                    ON S.SENIOR_ID=SC.SENIOR_ID
                    AND SC.TAKING_DATE=CURDATE()

                    LEFT JOIN TB_ALERT AL
                    ON AL.ALERT_CD=(
                        SELECT ALERT_CD
                        FROM TB_ALERT
                        WHERE SENIOR_ID=S.SENIOR_ID
                        ORDER BY ALERT_TIME DESC
                        LIMIT 1
                    )

                    WHERE S.SENIOR_ID=?

                    GROUP BY
                        S.SENIOR_ID,
                        S.SENIOR_NAME,
                        S.PILLBOX_NUM,
                        AL.ALERT_TYPE,
                        AL.ALERT_TIME
                    `;

                conn.query(statusSql,[selectedSeniorId],(err,statusRows)=>{

                    if(err){
                        console.log(err);
                        return res.send("DB 오류");
                    }

                    const row=statusRows[0];

                    const statuses=[{
                        seniorId:row.SENIOR_ID,
                        seniorName:row.SENIOR_NAME,
                        pillboxNum:row.PILLBOX_NUM,
                        todayTotal:row.todayTotal||0,
                        todayDone:row.todayDone||0,
                        todayMissed:row.todayMissed||0,
                        latestLogType:row.ALERT_TYPE,
                        latestLoggedAt:row.ALERT_TIME,
                        state:row.state,
                        stateLabel:
                            row.state==="ok"
                                ?"정상"
                                :row.state==="warn"
                                ?"대기"
                                :"확인 필요"
                    }];
                    res.render("user/user_dashboard/dashboard_stat",{
                    title:"실시간 상태",
                    user:req.session.user,
                    statuses,
                    summary,
                    seniorOptions:seniorRows,
                    selectedSeniorId
                });
            });
        });
    });
});

// 알림 관리 페이지
router.get("/user/user_dashboard/dashboard_call", isLoggedIn, (req, res) => {

    const seniorSql = `
        SELECT
            SENIOR_ID,
            SENIOR_NAME
        FROM TB_SENIOR
        WHERE MEM_ID = ?
        ORDER BY SENIOR_NAME
    `;

    conn.query(seniorSql, [req.session.user.id], (err, seniorRows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        const selectedSeniorId =
            req.query.senior || "";

        const selectedDate =
            req.query.date || "";

        const summarySql = `
            SELECT
                COUNT(*) AS total,

                SUM(
                    CASE
                        WHEN ALERT_TYPE='MISSED_MEDICINE'
                        THEN 1
                        ELSE 0
                    END
                ) AS missed,

                SUM(
                    CASE
                        WHEN ALERT_TYPE='WARN'
                        THEN 1
                        ELSE 0
                    END
                ) AS warn,

                SUM(
                    CASE
                        WHEN IS_RECEIVED='Y'
                        THEN 1
                        ELSE 0
                    END
                ) AS received

            FROM TB_ALERT

            WHERE MEM_ID=?
        `;

        conn.query(summarySql,[req.session.user.id],(err,summaryRows)=>{

            if(err){
                console.log(err);
                return res.send("DB 오류");
            }

            const summary={
                total:summaryRows[0].total||0,
                missed:summaryRows[0].missed||0,
                warn:summaryRows[0].warn||0,
                received:summaryRows[0].received||0
            };

            let alertSql = `
                SELECT
                    A.ALERT_CD,
                    A.SENIOR_ID,
                    S.SENIOR_NAME,
                    A.ALERT_TYPE,
                    A.ALERT_MSG,
                    A.ALERT_TIME,
                    A.CREATED_AT,
                    A.IS_RECEIVED
                FROM TB_ALERT A
                JOIN TB_SENIOR S
                ON A.SENIOR_ID = S.SENIOR_ID
                WHERE A.MEM_ID = ?
            `;

            const params = [req.session.user.id];

            if(selectedSeniorId){
                alertSql += ` AND A.SENIOR_ID = ? `;
                params.push(selectedSeniorId);
            }

            if(selectedDate){
                alertSql += ` AND DATE(A.ALERT_TIME) = ? `;
                params.push(selectedDate);
            }

            alertSql += `
                ORDER BY A.ALERT_TIME DESC
            `;

            conn.query(alertSql, params, (err, rows)=>{

                if(err){
                    console.log(err);
                    return res.send("DB 오류");
                }

                const alerts = rows.map(row=>{
                    let className = "warn";
                    switch(row.ALERT_TYPE){

                        case "MISSED_MEDICINE":
                            className = "late";
                            break;

                        case "TAKEN":
                            className = "ok";
                            break;

                        case "WARN":
                            className = "warn";
                            break;

                        case "SYSTEM":
                            className = "system";
                            break;
                    }

                    return{
                        alertCd: row.ALERT_CD,
                        seniorId: row.SENIOR_ID,
                        seniorName: row.SENIOR_NAME,
                        alertType: row.ALERT_TYPE,
                        alertMsg: row.ALERT_MSG,
                        alertTime: row.ALERT_TIME,
                        createdAt: row.CREATED_AT,
                        isReceived: row.IS_RECEIVED,
                        className
                    };
                });

                res.render("user/user_dashboard/dashboard_call",{
                    title:"알림 관리",
                    user:req.session.user,
                    alerts,
                    summary,
                    seniorOptions:seniorRows,
                    selectedSeniorId,
                    selectedDate
                });
            });
        });
    });
});

// 문의 
router.get('/user/user_service/inquiry/:id', isLoggedIn, (req, res) => {

    const sql = `
        SELECT *
        FROM TB_INQUIRY
        WHERE INQUIRY_CD = ? AND MEM_ID = ?
    `;

    conn.query(sql, [req.params.id, req.session.user.id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        if (rows.length === 0) {
            return res.send("문의를 찾을 수 없습니다.");
        }

        res.render("user/user_service/inquiry_detail", {
            title: "문의 상세",
            inquiry: rows[0],
            user: req.session.user,
            hasPillbox: true
        });
    });
});

// 문의 목록
router.post('/user/user_service/inquiry', isLoggedIn, (req, res) => {

    const sql = `
        SELECT INQUIRY_CD, INQUIRY_TYPE, INQUIRY_TITLE, INQUIRY_STATUS, CREATED_AT
        FROM TB_INQUIRY
        WHERE MEM_ID = ?
        ORDER BY CREATED_AT DESC
    `;

    conn.query(sql, [req.session.user.id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        res.render("user/user_service/inquiry", {
            title: "문의 목록",
            inquiries: rows
        });
    });
});





// 김성훈 7월 2일 수정

// 문의 작성 폼
router.get('/index/index_inquiry', isLoggedIn, (req, res) => {
    res.render("index/index_inquiry", {
        title: "문의하기",
        user: req.session.user
    });
});

// 문의 등록
router.post("/index/index_inquiry", isLoggedIn, (req, res) => {

    const {
        inquiry_type,
        inquiry_title,
        inquiry_content
    } = req.body;

    const user = req.session.user;

    let seniorId = null;

    // 시니어 로그인인 경우
    if (user.role === "S") {
        seniorId = user.id;
    }

    const sql = `
        INSERT INTO TB_INQUIRY
        (
            MEM_ID,
            SENIOR_ID,
            INQUIRY_TYPE,
            INQUIRY_TITLE,
            INQUIRY_CONTENT,
            INQUIRY_STATUS
        )
        VALUES
        (?, ?, ?, ?, ?, '대기')
    `;

    conn.query(
        sql,
        [
            user.id,
            seniorId,
            inquiry_type,
            inquiry_title,
            inquiry_content
        ],
        (err) => {

            if (err) {
                console.log(err);

                return res.send(`
                    <script>
                        alert('문의 등록에 실패했습니다.');
                        history.back();
                    </script>
                `);
            }

            res.send(`
                <script>
                    alert('문의가 등록되었습니다.');

                    location.href='/index/index_inquiry';
                </script>
            `);
        }
    );
});

router.get('/user/user_service/inquiry', isLoggedIn, (req, res) => {
    res.render("user/user_service/inquiry", {
        title: "문의하기"
    });
});

// 관리자 문의 목록
router.get("/admin/check_inquiry", isLoggedIn, (req, res) => {

    const sql = `
        SELECT *
        FROM TB_INQUIRY
        ORDER BY CREATED_AT DESC
    `;

    conn.query(sql, (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        res.render("admin/check_inquiry", {
            title: "문의 관리",
            inquiryList: rows,
            adminName: req.session.user.name || "관리자"
        });

    });

});

// 사용자 문의 목록
router.get("/user/user_service/check_inquiry", isLoggedIn, (req, res) => {

    const user = req.session.user;

    let sql;
    let params;

    if (user.role === "S") {

        sql = `
            SELECT *
            FROM TB_INQUIRY
            WHERE SENIOR_ID = ?
            ORDER BY CREATED_AT DESC
        `;

        params = [user.id];

    } else {

        sql = `
            SELECT *
            FROM TB_INQUIRY
            WHERE MEM_ID = ?
            ORDER BY CREATED_AT DESC
        `;

        params = [user.id];
    }

    conn.query(sql, params, (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        res.render("user/user_service/check_inquiry", {
            title: "문의 내역",
            user: user,
            inquiryList: rows
        });

    });

});


// 문의 상세
router.get("/admin/inquiry/:id", isLoggedIn, (req, res) => {

    const sql = `
        SELECT *
        FROM TB_INQUIRY
        WHERE INQUIRY_CD = ?
    `;

    conn.query(sql, [req.params.id], (err, rows) => {

        if (err) {
            console.log(err);
            return res.send("DB 오류");
        }

        if (rows.length === 0) {
            return res.send("문의가 존재하지 않습니다.");
        }

        res.render("admin/answer_inquiry", {
            title: "문의 답변",
            inquiry: rows[0]
        });
    });
});

router.post("/admin/inquiry/:id", isLoggedIn, (req, res) => {

    const answer = req.body.answer_content;

    const sql = `
        UPDATE TB_INQUIRY
        SET
            ANSWER_CONTENT = ?,
            ANSWERED_AT = NOW(),
            ANSWERED_BY = ?,
            INQUIRY_STATUS = '답변완료',
            UPDATED_AT = NOW()
        WHERE INQUIRY_CD = ?
    `;

    conn.query(
        sql,
        [
            answer,
            req.session.user.id,
            req.params.id
        ],
        (err) => {

            if (err) {
                console.log(err);

                return res.send(`
                    <script>
                        alert("답변 등록 실패");
                        history.back();
                    </script>
                `);
            }

            res.send(`
                <script>
                    alert("답변이 등록되었습니다.");
                    location.href="/admin/check_inquiry";
                </script>
            `);
        }
    );
});

router.get('/user/senior_info/senior_register-pillbox', isLoggedIn, (req, res) => {
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
                "user/senior_info/senior_register-pillbox", {
            title: "약통 등록",
            user: req.session.user,
            error: null,
            seniors: rows
          });
        }
    );
});

// 7월 4일 시니어 메인 대시보드 라우터
router.get("/user/senior_dashboard/senior_main_dashboard", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/");
    }

    const memId = req.session.user.id;

    const seniorSql = `
    SELECT
        M.MEM_ID,
        M.MEM_NAME,
        S.SENIOR_ID,
        S.SENIOR_NAME,
        S.PILLBOX_NUM
    FROM TB_MEMBER M
    INNER JOIN TB_SENIOR S
        ON M.MEM_ID = S.SENIOR_ID
    WHERE M.MEM_ID = ?
    `;

    conn.query(seniorSql,[memId],(err,seniorRows)=>{

        const memId = req.session.user.id;

        if(err){
            console.log(err);
            return res.send("DB 오류");
        }

        if(seniorRows.length===0){
            return res.send("시니어 정보가 없습니다.");
        }

        const senior=seniorRows[0];

        const todaySql=`

            SELECT
                MS.TAKING_TYPE,
                MS.TAKING_TIME,

                SC.TAKING_YN,
                SC.TAKEN_TIME

            FROM TB_MEDICINE_SCHEDULE MS

            LEFT JOIN TB_SCHEDULE SC

            ON MS.MEDI_SCHE_CD=SC.MEDI_SCHE_CD

            AND SC.TAKING_DATE=CURDATE()

            WHERE
                MS.SENIOR_ID=?
            AND
                MS.USE_YN='Y'
            ORDER BY MS.TAKING_TIME
            `;

            conn.query(todaySql,[senior.SENIOR_ID],(err,todayRows)=>{

                if(err){
                    console.log(err);
                    return res.send("DB 오류");
                }
                const today={
                    morning:"⏳ 대기중",
                    lunch:"⏳ 대기중",
                    dinner:"⏳ 대기중",
                    bedtime:"⏳ 대기중"
                };
                 const schedule=[];

                todayRows.forEach(row=>{
                    let text="⏳ 대기중";
                    let status="plan";
                    if(row.TAKING_YN==="Y"){
                        text="✅ 복용완료";
                        status="ok";
                    }

                    else if(row.TAKING_YN==="N"){
                        text="❌ 미복용";
                        status="warn";
                    }

                    switch(row.TAKING_TYPE){
                        case "아침":
                            today.morning=text;
                            break;
                        case "점심":
                            today.lunch=text;
                            break;
                        case "저녁":
                            today.dinner=text;
                            break;
                        case "취침 전":
                            today.bedtime=text;
                            break;
                    }
                    schedule.push({
                        meal:row.TAKING_TYPE,
                        time:row.TAKING_TIME.toString().substring(0,5),
                        status
                    });
                    const weeklySql = `

                        SELECT
                            TAKING_DATE,
                            TAKING_TYPE,
                            TAKING_YN

                        FROM TB_SCHEDULE
                        WHERE SENIOR_ID=?
                        AND YEARWEEK(TAKING_DATE,1)=YEARWEEK(CURDATE(),1)
                        ORDER BY TAKING_DATE
                        `;

                        conn.query(weeklySql,[senior.SENIOR_ID],(err,weekRows)=>{
                            if(err){
                                console.log(err);
                                return res.send("DB 오류");
                            }

                            let total=0;
                            let success=0;
                            let miss=0;
                            const takenDays=new Set();

                            weekRows.forEach(row=>{
                                total++;
                                if(row.TAKING_YN==="Y"){
                                    success++;
                                    takenDays.add(
                                        row.TAKING_DATE.toISOString().slice(0,10)
                                    );

                                }else{
                                    miss++;
                                }
                            });

                            const avgRate=
                                total===0
                                ?0
                                :Math.round(success/total*100);
                            const week={
                                월:{label:"월"},
                                화:{label:"화"},
                                수:{label:"수"},
                                목:{label:"목"},
                                금:{label:"금"},
                                토:{label:"토"},
                                일:{label:"일"}
                            };
                            Object.values(week).forEach(day=>{
                                day.morning="unset";
                                day.lunch="unset";
                                day.dinner="unset";
                                day.bedtime="unset";
                            });
                            const dayNames=[
                                "일",
                                "월",
                                "화",
                                "수",
                                "목",
                                "금",
                                "토"
                            ];
                            weekRows.forEach(row=>{

                                const day=
                                    dayNames[
                                        new Date(row.TAKING_DATE).getDay()
                                    ];
                                if(!week[day]) return;
                                const state=
                                    row.TAKING_YN==="Y"
                                    ?"done"
                                    :"missed";
                                switch(row.TAKING_TYPE){
                                    case "아침":
                                        week[day].morning=state;
                                        break;
                                    case "점심":
                                        week[day].lunch=state;
                                        break;
                                    case "저녁":
                                        week[day].dinner=state;
                                        break;
                                    case "취침 전":
                                        week[day].bedtime=state;
                                        break;
                                }
                            });
                            Object.values(week).forEach(day=>{
                                let count=0;
                                let ok=0;
                                ["morning","lunch","dinner","bedtime"].forEach(meal=>{
                                    if(day[meal]!=="unset"){
                                        count++;
                                    }

                                    if(day[meal]==="done"){
                                        ok++;
                                    }
                                });

                                day.rate=
                                    count===0
                                    ?null
                                    :Math.round(ok/count*100);
                            });
                            const weekly={

                                avgRate,
                                takenDays:takenDays.size,
                                missedCount:miss,
                                table:{
                                    range:"이번주",
                                    days:[
                                        week.월,
                                        week.화,
                                        week.수,
                                        week.목,
                                        week.금,
                                        week.토,
                                        week.일
                                    ]
                                }
                            };
                            const sensorSql = `

                            SELECT

                                PS.POWER_STATUS,
                                PS.LAST_HEARTBEAT_AT,
                                PS.UPDATED_AT,

                                (
                                    SELECT LOG_TYPE
                                    FROM TB_PILLBOX_LOG
                                    WHERE SENIOR_ID=?
                                    ORDER BY LOGGED_AT DESC
                                    LIMIT 1
                                ) AS LAST_LOG,

                                (

                                    SELECT LOGGED_AT
                                    FROM TB_PILLBOX_LOG
                                    WHERE SENIOR_ID=?
                                    ORDER BY LOGGED_AT DESC
                                    LIMIT 1
                                ) AS LAST_TIME
                            FROM TB_PILLBOX_STATUS PS
                            WHERE SENIOR_ID=?

                            `;

                            conn.query(
                                sensorSql,
                                [
                                    senior.SENIOR_ID,
                                    senior.SENIOR_ID,
                                    senior.SENIOR_ID
                                ],

                                (err,sensorRows)=>{

                                    if(err){
                                        console.log(err);
                                        return res.send("DB 오류");

                                    }

                                    let sensor={
                                        lidOpen:false,
                                        dbSync:false,
                                        updatedAt:"-",
                                        lastSync:"-",
                                        lastDetected:"-"

                                    };
                                    if(sensorRows.length){

                                        const row=sensorRows[0];
                                        sensor.lidOpen=
                                            row.LAST_LOG==="OPEN";
                                        sensor.dbSync=
                                            row.POWER_STATUS==="Y";
                                        sensor.updatedAt=
                                            row.UPDATED_AT
                                            ?row.UPDATED_AT.toLocaleString("ko-KR")
                                            :"-";
                                        sensor.lastSync=
                                            row.LAST_HEARTBEAT_AT
                                            ?row.LAST_HEARTBEAT_AT.toLocaleString("ko-KR")
                                            :"-";
                                        sensor.lastDetected=
                                            row.LAST_TIME
                                            ?row.LAST_TIME.toLocaleString("ko-KR")
                                            :"-";
                                    }
                                    res.render(
                                        "user/senior_dashboard/senior_main_dashboard",
                                        {
                                            title:"나의 복약 현황",
                                            user:{
                                                id:senior.MEM_ID,
                                                name:senior.SENIOR_NAME
                                            },
                                            today,
                                            weekly,
                                            schedule,
                                            sensor
                                }
                             );
                        }
                    );
                });
            });
        });
    });
});


// 사용자 공지사항 상세
router.get("/user/user_service/user_announce/:id", (req, res) => {

    const annId = req.params.id;

    // 조회수 증가
    const updateSql = `
        UPDATE TB_NOTICE
        SET VIEW_COUNT = VIEW_COUNT + 1
        WHERE ANN_ID = ?
        AND IS_VISIBLE = 'Y'
    `;

    conn.query(updateSql, [annId], (updateErr) => {

        if (updateErr) {
            console.log(updateErr);
            return res.send("DB 오류");
        }

        // 공지 조회
        const selectSql = `
            SELECT *
            FROM TB_NOTICE
            WHERE ANN_ID = ?
            AND IS_VISIBLE = 'Y'
        `;

        conn.query(selectSql, [annId], (err, rows) => {

            if (err) {
                console.log(err);
                return res.send("DB 오류");
            }

            if (rows.length === 0) {
                return res.send("공지사항이 존재하지 않습니다.");
            }

            res.render("user/user_service/user_announce", {
                title: rows[0].TITLE,
                notice: rows[0],
                user: req.session.user || null
            });
        });
    });
});



module.exports = router;