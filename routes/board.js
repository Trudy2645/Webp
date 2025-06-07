const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });


// 게시글 목록 (원글과 답글을 계층적으로 표시)
router.get('/', (req, res) => {
    // 현재 로그인한 사용자 정보 (세션에서 가져옴)
    const currentUser = req.session.user; // 여기에 user 정보가 있으면 로그인된 상태

    db.all(`
        SELECT * FROM posts ORDER BY COALESCE(parent_id, id) ASC, id ASC
    `, [], (err, allPosts) => {
        if (err) {
            console.error('Error fetching all posts:', err.message);
            return res.send('목록 불러오기 실패');
        }

        // 계층 구조를 만들기 위한 처리
        const hierarchicalPosts = [];
        const postMap = new Map();

        allPosts.forEach(post => {
            // 각 게시글에 isAuthor 속성을 추가하여 현재 로그인한 사용자가 작성자인지 표시
            // currentUser가 존재하고, post.author가 currentUser.username과 같으면 true
            const postWithAuth = {
                ...post,
                replies: [],
                isAuthor: currentUser && post.author === currentUser.username
            };
            postMap.set(post.id, postWithAuth);
        });

        // 답글을 해당 부모 게시글에 할당
        postMap.forEach(post => {
            if (post.parent_id) {
                const parent = postMap.get(post.parent_id);
                if (parent) { // 부모 게시글이 존재하는 경우
                    parent.replies.push(post);
                } else {
                    // 부모가 없으면 고아 답글로 처리 (혹은 최상위로 올릴 수 있음)
                    console.warn(`Orphan reply found: Post ID ${post.id} has parent_id ${post.parent_id} but parent not found.`);
                }
            } else {
                // 최상위 게시글은 계층 구조의 시작점
                hierarchicalPosts.push(post);
            }
        });

        // 최종적으로 계층 구조화된 게시글 목록을 템플릿으로 전달합니다.
        // user 정보를 템플릿에 함께 전달하여 로그인 여부 판단에 사용
        res.render('board', { title: '고객센터 게시판', posts: hierarchicalPosts, user: currentUser });
    });
});

// 글쓰기 폼
router.get('/new', (req, res) => {
    // 로그인 여부 확인
    if (!req.session.user) {
        // 로그인하지 않았다면 로그인 페이지로 리다이렉트
        return res.redirect('/user/login?redirect=/board/new');
    }
    // 로그인 했다면 글쓰기 폼 보여주기
    res.render('post', { post: null, parentId: null, user: req.session.user });
});

// 글쓰기 처리 + 파일 업로드
router.post('/new', upload.single('attachment'), (req, res) => {
    // 로그인 여부 확인 (작성 처리 시에도)
    if (!req.session.user) {
        return res.status(403).send('로그인 후 글을 작성할 수 있습니다.');
    }

    const { title, content, parent_id } = req.body;
    // 작성자를 세션에 저장된 로그인 사용자의 username으로 설정
    const author = req.session.user.username;

    db.run(
        'INSERT INTO posts (title, content, parent_id, author) VALUES (?, ?, ?, ?)',
        [title, content, parent_id || null, author],
        function (err) {
            if (err) {
                console.error('글 작성 실패:', err.message);
                return res.send('작성 실패');
            }

            const postId = this.lastID;

            // 파일이 있을 경우 files 테이블에 저장
            if (req.file) {
                const { filename, path: filepath } = req.file;
                db.run(
                    'INSERT INTO files (post_id, filename, filepath) VALUES (?, ?, ?)',
                    [postId, filename, filepath],
                    (err2) => {
                        if (err2) console.error('파일 저장 오류:', err2.message);
                        res.redirect('/board');
                    }
                );
            } else {
                res.redirect('/board');
            }
        }
    );
});

// 글 상세 + 파일조회
router.get('/view/:id', (req, res) => {
    const postId = req.params.id;
    const currentUser = req.session.user; // 현재 로그인한 사용자 정보

    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) return res.send('글 없음');

        // 상세 페이지에서도 작성자 여부 확인
        const isAuthor = currentUser && post.author === currentUser.username;

        // Fetch replies for the current post
        db.all('SELECT * FROM posts WHERE parent_id = ? ORDER BY id ASC', [postId], (replyErr, replies) => {
            if (replyErr) {
                console.error('Error fetching replies:', replyErr.message);
                replies = [];
            }
            // 답글에도 isAuthor 정보 추가 (답글도 수정/삭제 가능하도록)
            const repliesWithAuth = replies.map(reply => ({
                ...reply,
                isAuthor: currentUser && reply.author === currentUser.username
            }));


            db.all('SELECT * FROM files WHERE post_id = ?', [postId], (ferr, files) => {
                if (ferr) {
                    console.error('Error fetching files:', ferr.message);
                    files = [];
                }
                // 상세 페이지 템플릿에 isAuthor 정보와 repliesWithAuth를 전달
                res.render('detail', { post: { ...post, isAuthor }, files, replies: repliesWithAuth, user: currentUser });
            });
        });
    });
});


// 답글 달기 폼
router.get('/reply/:id', (req, res) => {
    // 로그인 여부 확인
    if (!req.session.user) {
        return res.redirect('/user/login?redirect=/board/reply/' + req.params.id);
    }
    const parentId = req.params.id;
    db.get("SELECT title FROM posts WHERE id = ?", [parentId], (err, row) => {
        if (err || !row) return res.send("원글 없음");
        // user 정보를 템플릿에 전달하여 작성자 필드를 자동 채우고 readonly로 만들 수 있도록
        res.render('reply', { parentId, parentTitle: row.title, user: req.session.user });
    });
});

// 댓글 달기 post (답글 등록 처리)
router.post('/create', (req, res) => {
    // 로그인 여부 확인
    if (!req.session.user) {
        return res.status(403).send('로그인 후 답글을 작성할 수 있습니다.');
    }
    const { content, parent_id } = req.body;
    // 작성자를 세션에 저장된 로그인 사용자의 username으로 설정
    const author = req.session.user.username;

    if (!parent_id) {
        return res.send('답글을 작성하려면 원글 ID가 필요합니다.');
    }

    db.get("SELECT title FROM posts WHERE id = ?", [parent_id], (err, parentPost) => {
        if (err || !parentPost) {
            console.error('원글 제목 조회 실패:', err.message);
            return res.send('답글 등록 실패: 원글을 찾을 수 없습니다.');
        }

        // 답글 제목을 "Re: 원글제목" 형태로 직접 생성
        // 이미 "Re: "가 붙어있다면 중복해서 붙이지 않도록 처리
        const replyTitle = parentPost.title.startsWith('Re: ') ? parentPost.title : `Re: ${parentPost.title}`;

        db.run(
            'INSERT INTO posts (author, title, content, parent_id) VALUES (?, ?, ?, ?)',
            [author, replyTitle, content, parent_id],
            function (err) {
                if (err) {
                    console.error('답글 등록 실패:', err.message);
                    return res.send('답글 등록 실패');
                }
                res.redirect('/board/view/' + parent_id);
            }
        );
    });
});


// 수정 폼
router.get('/edit/:id', (req, res) => {
    if (!req.session.user) {
        console.log(`수정 폼 요청 (ID: ${req.params.id}): 로그인되지 않은 사용자`); // 추가
        return res.redirect('/user/login?redirect=/board/edit/' + req.params.id);
    }

    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (err || !post) {
            console.error(`수정 폼 요청 (ID: ${req.params.id}): 글 없음 또는 DB 오류`, err); // 추가
            return res.send('글 없음');
        }

        // --- 디버깅용 로그 추가 ---
        console.log(`--- 수정 폼 요청 (ID: ${req.params.id}) ---`);
        console.log(`게시글 작성자: "${post.author}", 로그인 사용자: "${req.session.user.username}"`);
        // --- 디버깅용 로그 끝 ---

        if (post.author !== req.session.user.username) {
            console.warn(`수정 권한 없음: 게시글 작성자("${post.author}") !== 로그인 사용자("${req.session.user.username}")`); // 추가
            return res.status(403).send('수정 권한이 없습니다.');
        }

        res.render('edit',{ post, user: req.session.user });
    });
});
// 수정 처리
router.post('/edit/:id', (req, res) => {
    if (!req.session.user) {
        console.log(`수정 처리 요청 (ID: ${req.params.id}): 로그인되지 않은 사용자`); // 추가
        return res.status(403).send('로그인 후 수정할 수 있습니다.');
    }

    const postId = req.params.id;
    const { title, content } = req.body;
    const currentUserUsername = req.session.user.username;

    db.get('SELECT author, parent_id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) {
            console.error(`수정 처리 요청 (ID: ${postId}): 글 없음 또는 DB 오류`, err); // 추가
            return res.send('글 없음');
        }

        // --- 디버깅용 로그 추가 ---
        console.log(`--- 수정 처리 요청 (ID: ${postId}) ---`);
        console.log(`게시글 작성자: "${post.author}", 로그인 사용자: "${currentUserUsername}"`);
        // --- 디버깅용 로그 끝 ---

        if (post.author !== currentUserUsername) {
            console.warn(`수정 권한 없음: 게시글 작성자("${post.author}") !== 로그인 사용자("${currentUserUsername}")`); // 추가
            return res.status(403).send('수정 권한이 없습니다.');
        }

        db.run(
            'UPDATE posts SET title = ?, content = ? WHERE id = ?',
            [title, content, postId],
            (err) => {
                if (err) {
                    console.error(`수정 실패 (ID: ${postId}):`, err.message); // 추가
                    return res.send('수정 실패');
                }
                console.log(`게시글 ${postId} 수정 성공.`); // 추가
                const redirectId = post.parent_id ? post.parent_id : postId;
                res.redirect('/board/view/' + redirectId);
            }
        );
    });
});

// 삭제 (원글 삭제 시 답글도 함께 삭제)
router.get('/delete/:id', (req, res) => {
    if (!req.session.user) {
        console.log(`삭제 요청 (ID: ${req.params.id}): 로그인되지 않은 사용자`); // 추가
        return res.redirect('/user/login?redirect=/board');
    }

    const postIdToDelete = req.params.id;
    const currentUserUsername = req.session.user.username;

    db.get('SELECT author, parent_id FROM posts WHERE id = ?', [postIdToDelete], (err, post) => {
        if (err || !post) {
            console.error(`삭제 요청 (ID: ${postIdToDelete}): 글 없음 또는 DB 오류`, err); // 추가
            return res.send('글 없음');
        }

        // --- 디버깅용 로그 추가 ---
        console.log(`--- 삭제 요청 (ID: ${postIdToDelete}) ---`);
        console.log(`게시글 작성자: "${post.author}", 로그인 사용자: "${currentUserUsername}"`);
        // --- 디버깅용 로그 끝 ---

        if (post.author !== currentUserUsername) {
            console.warn(`삭제 권한 없음: 게시글 작성자("${post.author}") !== 로그인 사용자("${currentUserUsername}")`); // 추가
            return res.status(403).send('삭제 권한이 없습니다.');
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION;', (beginErr) => { // 트랜잭션 시작 콜백 추가
                if (beginErr) {
                    console.error('트랜잭션 시작 실패:', beginErr.message);
                    return res.send('삭제 실패 (트랜잭션 오류)');
                }
                console.log(`트랜잭션 시작: 게시글 ID ${postIdToDelete}`); // 추가
            });

            let deleteQuery = 'DELETE FROM posts WHERE id = ?';
            let deleteParams = [postIdToDelete];

            if (!post.parent_id) {
                deleteQuery = 'DELETE FROM posts WHERE id = ? OR parent_id = ?';
                deleteParams = [postIdToDelete, postIdToDelete];
                console.log(`원글 및 답글 삭제 쿼리: ${deleteQuery}, 파라미터: ${deleteParams}`); // 추가
            } else {
                console.log(`답글만 삭제 쿼리: ${deleteQuery}, 파라미터: ${deleteParams}`); // 추가
            }

            db.run(deleteQuery, deleteParams, (err) => {
                if (err) {
                    console.error('게시글(및 답글) 삭제 실패:', err.message);
                    db.run('ROLLBACK;');
                    return res.send('게시글 삭제 실패');
                }
                console.log(`게시글(및 답글) 삭제 성공: ID ${postIdToDelete}`); // 추가

                db.run('DELETE FROM files WHERE post_id = ?', [postIdToDelete], (err) => {
                    if (err) {
                        console.error('파일 정보 삭제 실패:', err.message);
                        db.run('ROLLBACK;');
                        return res.send('파일 정보 삭제 실패');
                    }
                    console.log(`파일 정보 삭제 성공: Post ID ${postIdToDelete}`); // 추가

                    db.run('COMMIT;', (commitErr) => {
                        if (commitErr) {
                            console.error('트랜잭션 커밋 실패:', commitErr.message);
                            return res.send('삭제 실패 (트랜잭션 오류)');
                        }
                        console.log(`트랜잭션 커밋 성공: 게시글 ID ${postIdToDelete} 삭제 완료`); // 추가
                        if (post.parent_id) {
                            res.redirect('/board/view/' + post.parent_id);
                        } else {
                            res.redirect('/board');
                        }
                    });
                });
            });
        });
    });
});

module.exports = router;