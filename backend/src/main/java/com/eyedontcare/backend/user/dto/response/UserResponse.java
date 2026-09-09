package com.eyedontcare.backend.user.dto.response;

import java.time.Instant;
import com.eyedontcare.backend.user.entity.User;
import com.eyedontcare.backend.user.enums.ProfileImageCode;
import com.eyedontcare.backend.user.enums.UserLoginType;

public record UserResponse(
    Long id,
    String email,
    String nickname,
    ProfileImageCode profileImageCode,
    UserLoginType loginType,
    Instant createdAt
) {

    public static UserResponse from(
        User user,
        UserLoginType loginType
    ) {
        return new UserResponse(
            user.getId(),
            user.getEmail(),
            user.getNickname(),
            user.getProfileImageCode(),
            loginType,
            user.getCreatedAt()
        );
    }
}
