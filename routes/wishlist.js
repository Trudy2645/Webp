// routes/wishlist.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../db/database.sqlite'); // 경로 조정
console.log(`wishlist.js DB Path: ${dbPath}`); // 이 줄 추가

const db = new sqlite3.Database(dbPath);

// 로그인 여부 확인 미들웨어 (인증 미들웨어는 별도로 구현되어 있어야 합니다)
function isAuthenticated(req, res, next) {
    // req.session.user 에 사용자 정보가 저장되어 있다고 가정합니다.
    if (req.session && req.session.user) {
        req.user = req.session.user; // req.user 객체에 사용자 정보가 있어야 라우터에서 req.user.id 접근 가능
        return next(); // 로그인되어 있으면 다음 미들웨어로
    }
    // 로그인되어 있지 않으면 401 응답 또는 로그인 페이지로 리다이렉트
    res.status(401).json({ success: false, message: '로그인이 필요합니다.' }); // Send JSON for AJAX
    // 또는 웹 페이지 이동이 필요하면 다음처럼 사용:
    // res.redirect('/user/login'); // 로그인 페이지 경로에 맞게 수정
}

// 1. 위시리스트에 상품 추가 (POST)
router.post('/add', isAuthenticated, (req, res) => {
    const userId = req.user.id; // 로그인된 사용자의 ID (인증 미들웨어에서 설정되어야 함)
    const productId = req.body.productId;

    if (!productId) {
        return res.status(400).json({ success: false, message: '상품 ID가 필요합니다.' });
    }

    const query = `INSERT OR IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)`;
    db.run(query, [userId, productId], function(err) {
        if (err) {
            console.error('위시리스트 추가 실패:', err.message);
            return res.status(500).json({ success: false, message: '위시리스트에 상품을 추가하는 데 실패했습니다.' });
        }
        if (this.changes > 0) { // If a new row was inserted
            res.json({ success: true, message: '상품이 위시리스트에 추가되었습니다.' });
        } else { // If the row already existed (due to INSERT OR IGNORE)
            res.json({ success: false, message: '이미 위시리스트에 있는 상품입니다.' });
        }
    });
});

// 2. 위시리스트 상품 조회 (GET)
router.get('/', isAuthenticated, (req, res) => {
    const userId = req.user.id; // 로그인된 사용자의 ID

    const query = `
        SELECT p.id, p.name, p.description, p.price, p.emoji, p.image, p.likes, p.is_featured
        FROM wishlist_items wi
        JOIN products p ON wi.product_id = p.id
        WHERE wi.user_id = ?
        ORDER BY wi.added_at DESC
    `;
    db.all(query, [userId], (err, items) => {
        if (err) {
            console.error('위시리스트 조회 실패:', err.message);
            // 에러 발생 시에도 EJS 템플릿 렌더링을 시도하여 사용자에게 오류를 보여주거나,
            // 아니면 500 상태 코드와 함께 오류 페이지를 렌더링하도록 합니다.
            // 일단은 빈 배열을 넘겨서 '위시리스트가 비어있습니다.' 메시지를 띄울 수도 있습니다.
            return res.render('wishlist', { wishlistItems: [], user: req.user, error: '위시리스트를 불러오는 데 실패했습니다.' });
        }
        // 이 console.log는 개발용입니다. 실제 데이터가 넘어오는지 확인
        console.log('Fetched wishlist items:', items);
        res.render('wishlist', { wishlistItems: items, user: req.user });
    });
});
// 3. 위시리스트에서 상품 제거 (POST)
router.post('/remove', isAuthenticated, (req, res) => {
    const userId = req.user.id;
    const productId = req.body.productId;

    if (!productId) {
        return res.status(400).json({ success: false, message: '상품 ID가 필요합니다.' });
    }

    const query = `DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?`;
    db.run(query, [userId, productId], function(err) {
        if (err) {
            console.error('위시리스트 삭제 실패:', err.message);
            return res.status(500).json({ success: false, message: '위시리스트에서 상품을 삭제하는 데 실패했습니다.' });
        }
        if (this.changes > 0) { // If a row was deleted
            res.json({ success: true, message: '상품이 위시리스트에서 삭제되었습니다.' });
        } else { // If no row was found (product not in wishlist)
            res.status(404).json({ success: false, message: '위시리스트에서 상품을 찾을 수 없습니다.' });
        }
    });
});

module.exports = router;