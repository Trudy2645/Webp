// initDB.js 파일
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, '../schema.sql'); // 이 경로는 현재 사용되지 않는 것 같습니다.

const db = new sqlite3.Database(dbPath);

// schema.sql 파일을 사용하지 않는다면 이 부분은 불필요할 수 있습니다.
// const schema = fs.readFileSync(schemaPath, 'utf-8');


// 테이블 생성 쿼리들
const createTables = [
  `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id INTEGER,
      author TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // 여기에 files 테이블 생성 쿼리 추가
  `CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      emoji TEXT,
      image TEXT,
      likes INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0
  )`,

  `DROP TABLE IF EXISTS cart_items`, // 기존 cart_items 삭제 후 재생성 (개발 단계에서만 사용)

  `CREATE TABLE IF NOT EXISTS cart_items (
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`
];

const insertProducts = [
  `INSERT INTO products (name, description, price, emoji, image) VALUES
    ('연차 생겨', '부장님 저 몸이 안좋아서..', 3500000,'', 'TakeDayOff.png'),
    ('칼퇴근', '안녕히 계세요 여러분', 28000,'', 'GoHome.png'),
    ('패스', '부장님과의 면담 패스', 5000, '', 'IDonKnow.png'),
    ('야근 제거', '1주일간 야근 없음', 2500000, '', 'NoOverTime.png'),
    ('회식 탈출', '집에 일이 생겨서...', 22000, '', 'NoStaffDinner.png'),
    ('퇴사', '저는 떠납니다!', 1000000000, '', 'Quit.png'),
    ('능력 향상', '효율 300% 증가', 26000, '', 'SkillUp.png')`
];

// 실행
db.serialize(() => {
  console.log('📦 DB 초기화 시작...');
  createTables.forEach((query) => {
    db.run(query, (err) => {
      if (err) {
        console.error('❌ 쿼리 실행 실패:', err.message);
      } else {
        // 테이블 생성 성공 로그를 추가하면 초기화 과정을 더 명확히 볼 수 있습니다.
        console.log(`✅ 테이블 생성 완료: ${query.split(' ')[5]}`); // 예: "users", "posts"
      }
    });
  });

  // 상품 데이터는 한 번만 삽입되도록 하거나, 초기화 시점에만 삽입되도록 로직을 조정하는 것이 좋습니다.
  // 이미 데이터가 있다면 이 쿼리 실행 시 에러가 날 수 있습니다.
  db.run(insertProducts[0], (err) => {
    if (err) console.error('❌ 샘플 상품 데이터 삽입 실패 (이미 존재할 수 있음):', err.message);
    else console.log('✅ 샘플 상품 삽입 완료');
  });
  console.log('✅ DB 초기화 완료');
});

db.close();