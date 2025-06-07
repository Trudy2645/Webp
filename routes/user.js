const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 회원가입 페이지
router.get('/register', (req, res) => {
    res.render('register'); //register.ejs
});

// 회원가입 처리
router.post('/register', async (req, res) => {
    const { username, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
        'INSERT INTO users (username, password, name) VALUES (?, ?, ?)',
        [username, hashedPassword, name],
        (err) => {
            if (err) {
                console.error(err.message);
                return res.send('회원가입 실패');
            }
            res.redirect('/user/login');
        }
    );
});

// 로그인 페이지
router.get('/login', (req, res) => {
    res.render('login'); //login.ejs
});

// 로그인 처리
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`로그인 시도: username=<span class="math-inline">\{username\}, password\=</span>{password}`);

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('DB 조회 오류:', err.message);
            return res.send('데이터베이스 오류가 발생했습니다.');
        }
        if (!user) {
            console.log(`사용자 없음: ${username}`);
            return res.send('존재하지 않는 사용자입니다.');
        }

        console.log(`DB에서 찾은 사용자: ${user.username}, 해싱된 비밀번호: ${user.password}`);
        const match = await bcrypt.compare(password, user.password);
        console.log(`비밀번호 일치 여부: ${match}`);

        if (match) {
            req.session.user = user;
            res.redirect('/');
        } else {
            res.status(401).send('비밀번호가 일치하지 않습니다.'); // 또는 res.render('login_failed')
        }
    });
});

// 로그아웃
// router.get('/logout', (req, res) => {
//     req.session.destroy();
//     res.redirect('/');
// });
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ 로그아웃 오류:', err);
        }
        res.redirect('/');
    });
});

module.exports = router;
