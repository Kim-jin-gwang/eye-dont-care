-- ERDcloud Import 전용 DDL (랭킹/Ranking 도메인 — 확장 시 사전집계 테이블)
-- ERDcloud: Import → SQL(DDL) 붙여넣기
-- MVP는 이 테이블 없이 온-리드 계산 가능. users는 기존 다이어그램에 이미 있어 FK 미선언(논리 참조).

CREATE TABLE `game_ranking_weekly` (
  `id`           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '랭킹 행 ID',
  `game_name`    VARCHAR(20) NOT NULL               COMMENT '게임',
  `play_mode`    VARCHAR(20) NOT NULL               COMMENT '랭킹 대상 모드(SOLO/RANDOM/AI)',
  `period_start` DATE        NOT NULL               COMMENT '주 시작(KST 월요일) · 주 버킷 키',
  `rank_type`    VARCHAR(20) NOT NULL               COMMENT 'WIN_COUNT / BEST_SCORE',
  `user_id`      BIGINT      NOT NULL               COMMENT '회원 ID (users 논리참조)',
  `metric_value` BIGINT      NOT NULL               COMMENT '최고 점수 or 승수(눈싸움은 ms)',
  `achieved_at`  TIMESTAMP   NOT NULL               COMMENT '동점 tie-break(먼저 달성 우선)',
  `rank_no`      INT         NULL                   COMMENT '사전계산 순위(선택)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ranking_game_period_user` (`game_name`, `period_start`, `user_id`)
) COMMENT='게임별 주간 랭킹(사전집계)';
