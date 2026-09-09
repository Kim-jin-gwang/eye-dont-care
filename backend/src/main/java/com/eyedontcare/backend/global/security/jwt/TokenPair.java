package com.eyedontcare.backend.global.security.jwt;

public record TokenPair(
    String accessToken,
    String refreshToken
) {
}
