const express = require('express');
const bcrypt = require('bcrypt'); // bcrypt는 비밀번호 해싱에 필요합니다.
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 회원가입 페이지 렌더링
router.get('/register', (req, res) => {
    // 이미 로그인된 상태라면 회원가입 페이지에 접근 못하도록 리다이렉트
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register');
});

// 회원가입 처리
router.post('/register', async (req, res) => {
    const { 
        username, 
        password, 
        name, 
        birthdate,       // 추가: 생년월일
        gender,          // 추가: 성별
        address,         // 추가: 주소
        email,           // 추가: 이메일
        phone,           // 추가: 휴대폰 번호
        email_consent,   // 추가: 이메일 수신 동의 (체크박스 값)
        personal_info_consent, // 추가: 개인정보 활용 동의 (체크박스 값)
        sms_consent      // 추가: SMS 수신 동의 (체크박스 값)
    } = req.body;

    if (!username || !password || !name || !birthdate || !gender || !email || !personal_info_consent) {
    return res.status(400).send('필수 입력 항목을 모두 작성해주세요.');
}

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // 비밀번호 해싱 (saltRounds: 10)
        // 동의 여부 필드는 체크박스에서 'on' 또는 undefined로 오므로, 1 또는 0으로 변환합니다.
        const emailConsentValue = email_consent ? 1 : 0;
        const personalInfoConsentValue = personal_info_consent ? 1 : 0;
        const smsConsentValue = sms_consent ? 1 : 0;

        db.run(
            // SQL 쿼리에 새로 추가된 필드들을 포함합니다.
            'INSERT INTO users (username, password, name, birthdate, gender, address, email, phone, email_consent, personal_info_consent, sms_consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                username, 
                hashedPassword, 
                name, 
                birthdate, 
                gender, 
                address, 
                email, 
                phone, 
                emailConsentValue,        // 변환된 동의 값
                personalInfoConsentValue, // 변환된 동의 값
                smsConsentValue           // 변환된 동의 값
            ],
            function (err){ // 일반 함수를 사용하여 'this' 컨텍스트에 접근
                if (err) {
                    console.error('회원가입 DB 오류:', err.message);
                    // UNIQUE constraint failed 오류 (아이디 중복) 처리
                    if (err.message.includes('UNIQUE constraint failed: users.username')) {
                        return res.status(409).send('이미 존재하는 사용자 이름입니다. 다른 이름을 사용해주세요.');
                    }
                    return res.status(500).send('회원가입 중 서버 오류가 발생했습니다.');
                }
                console.log(`✅ 새 사용자 '${username}' (${this.lastID}번) 회원가입 완료.`);
                res.redirect('/user/login'); // 회원가입 성공 후 로그인 페이지로 리다이렉트
            }
        );
    } catch (hashError) {
        console.error('비밀번호 해싱 오류:', hashError);
        res.status(500).send('비밀번호 처리 중 오류가 발생했습니다.');
    }
});

// 로그인 페이지 렌더링
router.get('/login', (req, res) => {
    // 이미 로그인된 상태라면 로그인 페이지에 접근 못하도록 홈으로 리다이렉트
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login');
});

// 마이페이지 렌더링
router.get('/mypage', (req, res) => {
    // 로그인된 사용자만 마이페이지에 접근할 수 있도록 확인
    if (!req.session.user) {
        // 로그인되지 않았다면 로그인 페이지로 리다이렉트
        // 중요한 것은 리다이렉트 후 함수 실행을 중단해야 합니다.
        return res.redirect('/user/login'); 
    }
    // req.session.user는 app.js에서 res.locals.user로 이미 전달되므로,
    // 여기서는 user 객체를 템플릿으로 다시 넘겨줄 필요 없이,
    // EJS 템플릿에서 res.locals.user를 통해 직접 접근할 수 있습니다.
    // 하지만 명시적으로 넘겨주는 것이 더 명확하고 일관적일 수 있습니다.
    res.render('mypage');
});

// 로그인 처리
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('사용자 이름과 비밀번호를 입력해주세요.');
    }

    console.log(`🔑 로그인 시도: username='${username}'`);

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('DB 조회 오류:', err.message);
            return res.status(500).send('데이터베이스 오류가 발생했습니다.');
        }
        if (!user) {
            console.log(`❌ 로그인 실패: 사용자 없음 ('${username}')`);
            return res.status(401).send('존재하지 않는 사용자 이름입니다.');
        }

        console.log(`🔍 DB에서 찾은 사용자: ${user.username}, 저장된 해싱된 비밀번호: ${user.password.substring(0, 15)}...`); // 보안상 일부만 표시
        
        try {
            // 사용자가 입력한 비밀번호와 DB에 저장된 해싱된 비밀번호를 비교
            const match = await bcrypt.compare(password, user.password);
            console.log(`비밀번호 일치 여부: ${match ? '✅ 일치' : '❌ 불일치'}`);

            if (match) {
                // 로그인 성공: 세션에 사용자 정보 저장 (새로 추가된 필드들도 함께 저장)
                // 비밀번호는 저장하지 않습니다.
                req.session.user = { 
                    id: user.id, 
                    username: user.username, 
                    name: user.name,
                    birthdate: user.birthdate,          // 추가: 생년월일
                    gender: user.gender,                // 추가: 성별
                    address: user.address,              // 추가: 주소
                    email: user.email,                  // 추가: 이메일
                    phone: user.phone,                  // 추가: 휴대폰 번호
                    email_consent: user.email_consent,  // 추가: 이메일 수신 동의
                    personal_info_consent: user.personal_info_consent, // 추가: 개인정보 활용 동의
                    sms_consent: user.sms_consent       // 추가: SMS 수신 동의
                };
                console.log(`🎉 로그인 성공: 사용자 '${user.username}'`);
                res.redirect('/'); // 로그인 성공 후 홈으로 리다이렉트
            } else {
                console.log(`❌ 로그인 실패: 비밀번호 불일치 ('${username}')`);
                res.status(401).send('비밀번호가 일치하지 않습니다.');
            }
        } catch (compareError) {
            console.error('비밀번호 비교 중 오류:', compareError);
            res.status(500).send('로그인 처리 중 오류가 발생했습니다.');
        }
    });
});

// 로그아웃 처리
router.get('/logout', (req, res) => {
    // 세션 파괴 및 오류 처리
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ 로그아웃 오류:', err);
            return res.status(500).send('로그아웃 중 오류가 발생했습니다.');
        }
        console.log('✅ 세션 파괴 및 로그아웃 완료.');
        res.redirect('/'); // 로그아웃 성공 후 홈으로 리다이렉트
    });
});

module.exports = router;