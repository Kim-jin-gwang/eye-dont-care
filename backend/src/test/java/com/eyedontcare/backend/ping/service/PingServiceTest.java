package com.eyedontcare.backend.ping.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import com.eyedontcare.backend.ping.dto.PingResponse;

class PingServiceTest {

	private final PingService pingService = new PingService();

	@Test
	void pingReturnsPongResponse() {
		PingResponse response = pingService.ping();

		assertThat(response.status()).isEqualTo("pong");
	}
}
