-- ERDcloud Import 전용 DDL (소모임/Group 도메인)
-- ERDcloud: 상단 메뉴 → Import → SQL(DDL) 붙여넣기
-- MySQL 스타일 + 한글 COMMENT(논리명). users는 기존 다이어그램에 이미 있으므로 FK 미선언(논리 참조).

CREATE TABLE `groups_` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '소모임 ID',
  `name`          VARCHAR(50)  NOT NULL               COMMENT '소모임 이름',
  `description`   VARCHAR(255) NULL                   COMMENT '소개',
  `group_code`    CHAR(6)      NOT NULL               COMMENT '입장 코드(대문자+숫자)',
  `owner_user_id` BIGINT       NOT NULL               COMMENT '방장 userId (users 논리참조)',
  `visibility`    VARCHAR(20)  NOT NULL               COMMENT 'PUBLIC / PRIVATE',
  `capacity`      INT          NOT NULL DEFAULT 50    COMMENT '정원(방장 포함)',
  `created_at`    TIMESTAMP    NOT NULL               COMMENT '생성 일시',
  `updated_at`    TIMESTAMP    NOT NULL               COMMENT '수정 일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_groups_group_code` (`group_code`)
) COMMENT='소모임';

CREATE TABLE `group_members` (
  `id`        BIGINT      NOT NULL AUTO_INCREMENT COMMENT '멤버 ID',
  `group_id`  BIGINT      NOT NULL               COMMENT '소모임 ID',
  `user_id`   BIGINT      NOT NULL               COMMENT '회원 ID (users 논리참조)',
  `role`      VARCHAR(20) NOT NULL               COMMENT 'OWNER / MEMBER',
  `joined_at` TIMESTAMP   NOT NULL               COMMENT '가입 일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_members_group_user` (`group_id`, `user_id`),
  CONSTRAINT `fk_group_members_group` FOREIGN KEY (`group_id`) REFERENCES `groups_` (`id`)
) COMMENT='소모임 멤버';
