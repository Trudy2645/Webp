const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const createTables = [
  `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      -- 새 필드 추가 시작
      birthdate TEXT,
      gender TEXT,
      address TEXT,
      email TEXT,
      phone TEXT,
      email_consent INTEGER DEFAULT 0,
      personal_info_consent INTEGER DEFAULT 0,
      sms_consent INTEGER DEFAULT 0
      -- 새 필드 추가 끝
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id INTEGER,
      author TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
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
  `DROP TABLE IF EXISTS cart_items`,
  `CREATE TABLE IF NOT EXISTS cart_items (
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS wishlist_items (
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

// 데이터베이스 초기화 및 테이블/데이터 삽입 실행
db.serialize(async () => { // 콜백 함수를 async로 유지
  console.log('📦 DB 초기화 시작...');

  try {
    // 1. 테이블 생성
    // db_init.js 파일 내
for (const query of createTables) {
  await new Promise((resolve, reject) => {
    db.run(query, (err) => {
      if (err) {
        console.error(`❌ 쿼리 실행 실패: ${err.message}\n쿼리: ${query.split('\n')[0].substring(0, 50)}...`);
        reject(err);
      } else {
        // 이 부분을 수정합니다.
        const tableNameMatch = query.match(/CREATE TABLE IF NOT EXISTS (\S+)/);
        if (tableNameMatch && tableNameMatch[1]) {
            console.log(`✅ 테이블 생성/확인 완료: ${tableNameMatch[1]}`);
        } else if (query.startsWith('DROP TABLE')) {
            console.log(`🗑️ 테이블 삭제 완료: ${query.split(' ')[3] || query.split(' ')[2]}`);
        } else {
            console.log(`✅ 쿼리 실행 완료: ${query.split('\n')[0].substring(0, 50)}...`);
        }
        resolve();
      }
    });
  });
}


    // 2. 관리자 계정 'admin' 추가
    const adminUsername = 'admin';
    const adminPassword = 'admin';
    const adminName = '관리자';
    // 관리자 계정의 새 필드 기본값 설정 (필요에 따라 수정)
    const adminBirthdate = '1990-01-01';
    const adminGender = 'Male';
    const adminAddress = 'Seoul, South Korea';
    const adminEmail = 'admin@example.com';
    const adminPhone = '010-1234-5678';
    const adminEmailConsent = 1; // 1 = 동의, 0 = 비동의
    const adminPersonalInfoConsent = 1;
    const adminSmsConsent = 1;
    // 비밀번호 해싱
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    await new Promise((resolve, reject) => {
      db.run(
        // users 테이블의 새 필드에 대한 값 추가 (INSERT OR IGNORE 문 수정)
        'INSERT OR IGNORE INTO users (username, password, name, birthdate, gender, address, email, phone, email_consent, personal_info_consent, sms_consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [adminUsername, hashedAdminPassword, adminName, adminBirthdate, adminGender, adminAddress, adminEmail, adminPhone, adminEmailConsent, adminPersonalInfoConsent, adminSmsConsent],
        function (err) {
          if (err) {
            console.error('❌ 관리자 계정 삽입 실패:', err.message);
            reject(err);
          } else if (this.changes > 0) {
            console.log(`✅ 관리자 계정 '${adminUsername}' 생성 완료.`);
            resolve();
          } else {
            console.log(`✅ 관리자 계정 '${adminUsername}' 이미 존재함 (스킵).`);
            resolve();
          }
        }
      );
    });
    
    // 3. 샘플 상품 데이터 삽입
    await new Promise((resolve, reject) => {
      db.run(insertProducts[0], (err) => {
        if (err) {
            if (!err.message.includes('SQLITE_CONSTRAINT_PRIMARYKEY')) {
                console.error('❌ 샘플 상품 데이터 삽입 실패:', err.message);
            } else {
                console.log('✅ 샘플 상품 데이터 이미 존재함 (스킵).');
            }
            resolve();
        } else {
            console.log('✅ 샘플 상품 삽입 완료');
            resolve();
        }
      });
    });

    console.log('✅ DB 초기화 완료');

  } catch (error) {
    console.error('⚠️ DB 초기화 중 치명적인 오류 발생:', error.message);
  } finally {
    // 모든 비동기 작업이 완료된 후 DB 연결을 닫습니다.
    db.close((err) => {
        if (err) {
            console.error('DB 닫기 오류:', err.message);
        } else {
            console.log('DB 연결 종료.');
        }
    });
  }
});