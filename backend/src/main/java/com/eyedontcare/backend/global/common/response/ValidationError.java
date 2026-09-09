package com.eyedontcare.backend.global.common.response;

public record ValidationError(
    String field,
    String reason
) {
}
