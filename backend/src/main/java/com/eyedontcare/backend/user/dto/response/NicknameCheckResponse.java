package com.eyedontcare.backend.user.dto.response;

public record NicknameCheckResponse(
    String nickname,
    boolean available
) {
}
