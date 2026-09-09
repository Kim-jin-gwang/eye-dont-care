-- 소모임 후기 게시판(글·댓글) ERD — ERDCloud "가져오기 > DDL"에 붙여넣기용
-- 기존 ERD에 users, groups_ 테이블이 있는 프로젝트에 임포트하세요.
-- (실제 DB는 PostgreSQL이며 논리 FK만 사용하지만, ERD 관계선 표현을 위해 FK로 작성)

CREATE TABLE group_posts (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '후기 글 ID',
    group_id        BIGINT       NOT NULL COMMENT '소모임 ID (groups_.id)',
    author_user_id  BIGINT       NOT NULL COMMENT '작성자 회원 ID (users.id)',
    content         VARCHAR(500) NOT NULL COMMENT '후기 내용(최대 500자)',
    created_at      DATETIME     NOT NULL COMMENT '작성 시각',
    updated_at      DATETIME     NOT NULL COMMENT '수정 시각',
    PRIMARY KEY (id),
    CONSTRAINT fk_group_posts_group
        FOREIGN KEY (group_id) REFERENCES groups_ (id),
    CONSTRAINT fk_group_posts_author
        FOREIGN KEY (author_user_id) REFERENCES users (id)
) COMMENT = '소모임 후기 글';

CREATE TABLE group_comments (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '댓글 ID',
    post_id         BIGINT       NOT NULL COMMENT '후기 글 ID (group_posts.id)',
    author_user_id  BIGINT       NOT NULL COMMENT '작성자 회원 ID (users.id)',
    content         VARCHAR(200) NOT NULL COMMENT '댓글 내용(최대 200자)',
    created_at      DATETIME     NOT NULL COMMENT '작성 시각',
    updated_at      DATETIME     NOT NULL COMMENT '수정 시각',
    PRIMARY KEY (id),
    CONSTRAINT fk_group_comments_post
        FOREIGN KEY (post_id) REFERENCES group_posts (id),
    CONSTRAINT fk_group_comments_author
        FOREIGN KEY (author_user_id) REFERENCES users (id)
) COMMENT = '소모임 후기 댓글';
