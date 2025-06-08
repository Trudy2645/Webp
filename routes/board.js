const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const router = express.Router();
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// Ensure 'posts' table exists and 'is_pinned' column exists
db.serialize(() => {
    // First, ensure the 'posts' table itself exists
    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            parent_id INTEGER,
            author TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_pinned BOOLEAN DEFAULT 0
        )
    `, (err) => {
        if (err) {
            console.error('Error creating posts table:', err.message);
        } else {
            // After ensuring the table exists, check for and add the 'is_pinned' column
            // This acts as a simple migration step for existing databases
            db.get("PRAGMA table_info(posts)", (pragmaErr, columns) => {
                if (pragmaErr) {
                    console.error('Error checking table info:', pragmaErr.message);
                    return;
                }

                let isPinnedExists = false;
                // 'columns'는 배열로 반환되거나, 테이블이 없으면 undefined일 수 있습니다.
                // 테이블 생성은 위에 이미 보장되므로, 주로 배열일 것입니다.
                if (Array.isArray(columns)) {
                    isPinnedExists = columns.some(col => col.name === 'is_pinned');
                }

                if (!isPinnedExists) {
                    db.run(`ALTER TABLE posts ADD COLUMN is_pinned BOOLEAN DEFAULT 0`, (alterErr) => {
                        if (alterErr) {
                            console.error('Error adding is_pinned column to posts table:', alterErr.message);
                        } else {
                            console.log('Successfully added is_pinned column to posts table.');
                        }
                    });
                }
            });
        }
    });

    // Ensure 'files' table exists for attachments
    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating files table:', err.message);
        }
    });
});


// 파일 업로드 설정
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });

// 모든 /board 경로에 대해 세션 사용자 정보를 res.locals.user로 전달
router.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// 게시글 목록 (원글과 답글을 계층적으로 표시)
router.get('/', (req, res) => {
    const currentUser = req.session.user;

    // Fetch pinned posts first
    db.all(`
        SELECT * FROM posts WHERE is_pinned = 1 ORDER BY created_at DESC
    `, [], (errPinned, pinnedPosts) => {
        if (errPinned) {
            console.error('Error fetching pinned posts:', errPinned.message);
            return res.status(500).send('목록 불러오기 실패');
        }

        // Then fetch regular posts (excluding pinned ones, though they shouldn't overlap if correctly managed)
        db.all(`
            SELECT * FROM posts WHERE is_pinned = 0 ORDER BY COALESCE(parent_id, id) ASC, id ASC
        `, [], (errRegular, regularPosts) => {
            if (errRegular) {
                console.error('Error fetching regular posts:', errRegular.message);
                return res.status(500).send('목록 불러오기 실패');
            }

            const allPosts = [...pinnedPosts, ...regularPosts]; // Combine pinned and regular posts

            const hierarchicalPosts = [];
            const postMap = new Map();

            allPosts.forEach(post => {
                const isAuthor = currentUser && post.author === currentUser.username;
                const isDeletable = currentUser && (currentUser.username === 'admin' || post.author === currentUser.username);

                const postWithAuth = {
                    ...post,
                    replies: [],
                    isAuthor: isAuthor,
                    isDeletable: isDeletable,
                    isPinned: post.is_pinned === 1 // Pass the pinned status to EJS
                };
                postMap.set(post.id, postWithAuth);
            });

            postMap.forEach(post => {
                if (post.parent_id) {
                    const parent = postMap.get(post.parent_id);
                    if (parent) {
                        parent.replies.push(post);
                    } else {
                        console.warn(`Orphan reply found: Post ID ${post.id} has parent_id ${post.parent_id} but parent not found.`);
                    }
                } else {
                    hierarchicalPosts.push(post);
                }
            });

            // Sort hierarchicalPosts to ensure pinned posts are at the very top.
            // Pinned posts might not have a parent_id, so they will naturally be top-level.
            // The initial DB query order helps, but re-sorting ensures it for combined lists.
            hierarchicalPosts.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                // For posts with the same pinned status, maintain original order (or sort by creation date if needed)
                return 0; // Keep original order or apply another sorting criterion here
            });


            res.render('board', { title: '고객센터 게시판', posts: hierarchicalPosts, user: currentUser });
        });
    });
});


// 글쓰기 폼
router.get('/new', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/user/login?redirect=/board/new');
    }
    const isAdmin = req.session.user.username === 'admin';
    res.render('post', { post: null, parentId: null, user: req.session.user, isAdmin: isAdmin });
});

// 글쓰기 처리 + 파일 업로드
router.post('/new', upload.single('attachment'), (req, res) => {
    if (!req.session.user) {
        return res.status(403).send('로그인 후 글을 작성할 수 있습니다.');
    }

    let { title, content, parent_id } = req.body;
    const author = req.session.user.username;
    const isAdmin = author === 'admin';
    let is_pinned = 0;

    // If admin, title is automatically "공지사항" and is_pinned is true
    if (isAdmin) {
        title = "공지사항";
        is_pinned = 1;
    }

    if (!title || !content) {
        return res.status(400).send('제목과 내용을 모두 입력해주세요.');
    }

    db.run(
        'INSERT INTO posts (title, content, parent_id, author, is_pinned) VALUES (?, ?, ?, ?, ?)',
        [title, content, parent_id || null, author, is_pinned],
        function (err) {
            if (err) {
                console.error('글 작성 실패:', err.message);
                return res.status(500).send('작성 실패');
            }

            const postId = this.lastID;

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

// 글 상세 + 파일조회 (No changes needed here for notice functionality)
router.get('/view/:id', (req, res) => {
    const postId = req.params.id;
    const currentUser = req.session.user;

    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) return res.status(404).send('글 없음');

        post.isAuthor = currentUser && post.author === currentUser.username;
        post.isDeletable = currentUser && (currentUser.username === 'admin' || post.author === currentUser.username);
        post.isPinned = post.is_pinned === 1; // Pass pinned status to detail view

        db.all('SELECT * FROM posts WHERE parent_id = ? ORDER BY id ASC', [postId], (replyErr, replies) => {
            if (replyErr) {
                console.error('Error fetching replies:', replyErr.message);
                replies = [];
            }
            const repliesWithAuth = replies.map(reply => {
                const isReplyAuthor = currentUser && reply.author === currentUser.username;
                const isReplyDeletable = currentUser && (currentUser.username === 'admin' || reply.author === currentUser.username);
                return {
                    ...reply,
                    isAuthor: isReplyAuthor,
                    isDeletable: isReplyDeletable
                };
            });

            db.all('SELECT * FROM files WHERE post_id = ?', [postId], (ferr, files) => {
                if (ferr) {
                    console.error('Error fetching files:', ferr.message);
                    files = [];
                }
                res.render('detail', { post: post, files, replies: repliesWithAuth, user: currentUser });
            });
        });
    });
});

// 답글 달기 폼 (No changes needed here)
router.get('/reply/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/user/login?redirect=/board/reply/' + req.params.id);
    }
    const parentId = req.params.id;
    db.get("SELECT title FROM posts WHERE id = ?", [parentId], (err, row) => {
        if (err || !row) return res.status(404).send("원글 없음");
        res.render('reply', { parentId, parentTitle: row.title, user: req.session.user });
    });
});

// 답글 등록 처리 (No changes needed here)
router.post('/create', (req, res) => {
    if (!req.session.user) {
        return res.status(403).send('로그인 후 답글을 작성할 수 있습니다.');
    }
    const { content, parent_id } = req.body;
    const author = req.session.user.username;

    if (!content || !parent_id) {
        return res.status(400).send('답글 내용과 원글 ID가 필요합니다.');
    }

    db.get("SELECT title FROM posts WHERE id = ?", [parent_id], (err, parentPost) => {
        if (err || !parentPost) {
            console.error('원글 제목 조회 실패:', err.message);
            return res.status(500).send('답글 등록 실패: 원글을 찾을 수 없습니다.');
        }

        const replyTitle = parentPost.title.startsWith('Re: ') ? parentPost.title : `Re: ${parentPost.title}`;

        db.run(
            'INSERT INTO posts (author, title, content, parent_id) VALUES (?, ?, ?, ?)',
            [author, replyTitle, content, parent_id],
            function (err) {
                if (err) {
                    console.error('답글 등록 실패:', err.message);
                    return res.status(500).send('답글 등록 실패');
                }
                console.log(`✅ 답글 ${this.lastID}번 작성 완료 (원글 ${parent_id}번).`);
                res.redirect('/board/view/' + parent_id);
            }
        );
    });
});

// 수정 폼 (작성자만 가능)
router.get('/edit/:id', (req, res) => {
    if (!req.session.user) {
        console.log(`수정 폼 요청 (ID: ${req.params.id}): 로그인되지 않은 사용자`);
        return res.redirect('/user/login?redirect=/board/edit/' + req.params.id);
    }

    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (err || !post) {
            console.error(`수정 폼 요청 (ID: ${req.params.id}): 글 없음 또는 DB 오류`, err);
            return res.status(404).send('글 없음');
        }

        // 수정 권한: 본인 작성 글만 가능
        if (post.author !== req.session.user.username) {
            console.warn(`수정 권한 없음: 게시글 작성자("${post.author}") !== 로그인 사용자("${req.session.user.username}")`);
            return res.status(403).send('수정 권한이 없습니다. 본인 글만 수정할 수 있습니다.');
        }

        const isAdmin = req.session.user.username === 'admin';
        // If it's a pinned post, title is not editable for admin.
        const isTitleEditable = !(isAdmin && post.is_pinned === 1);

        res.render('edit', { post, user: req.session.user, isAdmin: isAdmin, isTitleEditable: isTitleEditable });
    });
});

// 수정 처리 (작성자만 가능)
router.post('/edit/:id', (req, res) => {
    if (!req.session.user) {
        console.log(`수정 처리 요청 (ID: ${req.params.id}): 로그인되지 않은 사용자`);
        return res.status(403).send('로그인 후 수정할 수 있습니다.');
    }

    const postId = req.params.id;
    let { title, content } = req.body;
    const currentUserUsername = req.session.user.username;

    db.get('SELECT author, parent_id, is_pinned FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) {
            console.error(`수정 처리 요청 (ID: ${postId}): 글 없음 또는 DB 오류`, err);
            return res.status(404).send('글 없음');
        }

        if (post.author !== currentUserUsername) {
            console.warn(`수정 권한 없음: 게시글 작성자("${post.author}") !== 로그인 사용자("${currentUserUsername}")`);
            return res.status(403).send('수정 권한이 없습니다. 본인 글만 수정할 수 있습니다.');
        }

        // If it's an admin and a pinned post, ensure title remains "공지사항"
        if (currentUserUsername === 'admin' && post.is_pinned === 1) {
            title = "공지사항"; // Force title to be "공지사항"
        }

        db.run(
            'UPDATE posts SET title = ?, content = ? WHERE id = ?',
            [title, content, postId],
            (err) => {
                if (err) {
                    console.error(`수정 실패 (ID: ${postId}):`, err.message);
                    return res.status(500).send('수정 실패');
                }
                console.log(`게시글 ${postId} 수정 성공.`);
                const redirectId = post.parent_id ? post.parent_id : postId;
                res.redirect('/board/view/' + redirectId);
            }
        );
    });
});


// 삭제 (원글 삭제 시 답글도 함께 삭제) - admin 또는 작성자 본인만 가능
router.post('/delete/:id', (req, res) => {
    if (!req.session.user) {
        console.log(`삭제 요청 (ID: ${req.params.id}): 로그인되지 않은 사용자`);
        return res.status(401).send('로그인이 필요합니다.');
    }

    const postIdToDelete = req.params.id;
    const currentUserUsername = req.session.user.username;

    db.get('SELECT author, parent_id FROM posts WHERE id = ?', [postIdToDelete], (err, post) => {
        if (err || !post) {
            console.error(`삭제 요청 (ID: ${postIdToDelete}): 글 없음 또는 DB 오류`, err);
            return res.status(404).send('글 없음');
        }

        if (currentUserUsername === 'admin' || post.author === currentUserUsername) {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION;', (beginErr) => {
                    if (beginErr) {
                        console.error('트랜잭션 시작 실패:', beginErr.message);
                        return res.status(500).send('삭제 실패 (트랜잭션 오류)');
                    }
                    console.log(`트랜잭션 시작: 게시글 ID ${postIdToDelete}`);
                });

                let deleteQuery = 'DELETE FROM posts WHERE id = ?';
                let deleteParams = [postIdToDelete];

                if (!post.parent_id) { // 원글 삭제 시 해당 원글과 모든 답글 삭제
                    deleteQuery = 'DELETE FROM posts WHERE id = ? OR parent_id = ?';
                    deleteParams = [postIdToDelete, postIdToDelete];
                    console.log(`원글 및 답글 삭제 쿼리: ${deleteQuery}, 파라미터: ${deleteParams}`);
                } else { // 답글만 삭제
                    console.log(`답글만 삭제 쿼리: ${deleteQuery}, 파라미터: ${deleteParams}`);
                }

                db.run(deleteQuery, deleteParams, (err) => {
                    if (err) {
                        console.error('게시글(및 답글) 삭제 실패:', err.message);
                        db.run('ROLLBACK;');
                        return res.status(500).send('게시글 삭제 실패');
                    }
                    console.log(`게시글(및 답글) 삭제 성공: ID ${postIdToDelete}`);

                    db.run('DELETE FROM files WHERE post_id = ?', [postIdToDelete], (err) => {
                        if (err) {
                            console.error('파일 정보 삭제 실패:', err.message);
                        }
                        console.log(`파일 정보 삭제 성공: Post ID ${postIdToDelete}`);

                        db.run('COMMIT;', (commitErr) => {
                            if (commitErr) {
                                console.error('트랜잭션 커밋 실패:', commitErr.message);
                                return res.status(500).send('삭제 실패 (트랜잭션 오류)');
                            }
                            console.log(`트랜잭션 커밋 성공: 게시글 ID ${postIdToDelete} 삭제 완료`);
                            if (post.parent_id) {
                                res.redirect('/board/view/' + post.parent_id);
                            } else {
                                res.redirect('/board');
                            }
                        });
                    });
                });
            });
        } else {
            console.warn(`삭제 권한 없음: 게시글 작성자("${post.author}") !== 로그인 사용자("${currentUserUsername}") AND "${currentUserUsername}" !== "admin"`);
            return res.status(403).send('삭제 권한이 없습니다. 관리자 또는 본인 글만 삭제할 수 있습니다.');
        }
    });
});

module.exports = router;
