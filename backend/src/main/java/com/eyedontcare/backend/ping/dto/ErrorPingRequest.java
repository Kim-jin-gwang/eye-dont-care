package com.eyedontcare.backend.ping.dto;

import jakarta.validation.constraints.NotBlank;

public record ErrorPingRequest(
	@NotBlank(message = "메시지는 필수입니다.")
	String message
) {
}
