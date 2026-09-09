package com.eyedontcare.backend.auth.dto.response;

import com.eyedontcare.backend.global.security.jwt.TokenPair;

public record TokenResponse(
    String accessToken,
    String refreshToken
) {

    public static TokenResponse from(TokenPair tokenPair) {
        return new TokenResponse(
            tokenPair.accessToken(),
            tokenPair.refreshToken()
        );
    }
}
