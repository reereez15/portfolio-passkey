-- 과제8 DB 스키마 (MySQL / MariaDB / Aiven 호환)

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 등록된 패스키(공개키)만 저장한다. 개인키는 절대 서버에 오지 않는다.
CREATE TABLE IF NOT EXISTS credentials (
  id VARCHAR(255) PRIMARY KEY,           -- credential ID (base64url 문자열)
  user_id INT NOT NULL,
  public_key TEXT NOT NULL,              -- 공개키 (base64url 문자열) — 비밀번호가 아님
  counter BIGINT NOT NULL DEFAULT 0,     -- 서명 카운터(복제 탐지용, 0이면 카운터 미지원 기기)
  transports VARCHAR(255),               -- 예: "internal,hybrid"
  device_name VARCHAR(128) NOT NULL,     -- 사람이 알아볼 수 있는 이름
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 등록/로그인용 일회용 질문(challenge). 확인 즉시(성공/실패 모두) 삭제해 재사용을 막는다.
CREATE TABLE IF NOT EXISTS challenges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('register', 'login') NOT NULL,
  challenge VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 비공개 영역 콘텐츠. 계정별로 완전히 분리되어 있다.
CREATE TABLE IF NOT EXISTS private_content (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category ENUM('game_ideas', 'side_projects', 'snippets') NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
