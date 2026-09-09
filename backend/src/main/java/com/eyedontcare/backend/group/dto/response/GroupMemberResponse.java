package com.eyedontcare.backend.group.dto.response;

import java.time.Instant;
import com.eyedontcare.backend.group.entity.GroupRole;

/**
 * 길드원 한 명. 닉네임은 users에서 조회해 채운다.
 */
public record GroupMemberResponse(
	Long userId,
	String nickname,
	GroupRole role,
	Instant joinedAt
) {
}
