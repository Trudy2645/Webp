// // routes/order.js
// const express = require('express');
// const router = express.Router();
//
// router.post('/confirm', (req, res) => {
//     // 실제 주문 로직은 생략하고 더미 페이지 렌더링
//     res.render('order_confirm', {
//         user: req.session.user || { name: '손님' }, // 사용자 세션
//     });
// });
//
// module.exports = router;

// 장바구니에 내용이 있을 때만 주문 가능하게 수정
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

router.post('/confirm', (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/login');
    }

    const checkCartQuery = `SELECT COUNT(*) AS count FROM cart_items WHERE user_id = ?`;

    db.get(checkCartQuery, [user.id], (err, row) => {
        if (err) {
            console.error('장바구니 확인 실패:', err.message);
            return res.status(500).send('DB 오류: 장바구니 확인 실패');
        }

        if (row.count === 0) {
            return res.render('order_confirm', {
                user,
                error: '장바구니가 비어 있어 주문할 수 없습니다.',
            });
        }

        // 장바구니에 상품이 있는 경우 주문 처리 (현재는 더미)
        // 여기에 실제 주문 생성 및 결제 로직이 들어갈 수 있습니다.
        // ... (예: order 테이블에 주문 정보 추가, 결제 처리 등)

        // 주문 처리 후 장바구니 비우기
        const clearCartQuery = `DELETE FROM cart_items WHERE user_id = ?`;
        db.run(clearCartQuery, [user.id], function(err) {
            if (err) {
                console.error('장바구니 비우기 실패:', err.message);
                // 장바구니 비우기 실패해도 주문 확인 페이지는 보여줄 수 있음
                return res.status(500).render('order_confirm', {
                    user,
                    message: '주문이 접수되었으나, 장바구니를 비우는 데 문제가 발생했습니다.',
                    error: err.message
                });
            }

            // 장바구니 비우기 성공 시 주문 확인 페이지 렌더링
            res.render('order_confirm', {
                user,
                message: '주문이 성공적으로 접수되었습니다!'
            });
        });
    });
});

module.exports = router;