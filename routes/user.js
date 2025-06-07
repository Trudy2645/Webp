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
    const { username, password, name } = req.body;

    if (!username || !password || !name) {
        return res.status(400).send('사용자 이름, 비밀번호, 이름을 모두 입력해주세요.');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // 비밀번호 해싱 (saltRounds: 10)

        db.run(
            'INSERT INTO users (username, password, name) VALUES (?, ?, ?)',
            [username, hashedPassword, name],
            function (err) { // 일반 함수를 사용하여 'this' 컨텍스트에 접근
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
                // 로그인 성공: 세션에 사용자 정보 저장 (비밀번호는 저장하지 않음)
                req.session.user = { id: user.id, username: user.username, name: user.name };
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