package com.eyedontcare.backend.ping.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.eyedontcare.backend.global.common.response.ApiResponse;
import com.eyedontcare.backend.ping.dto.PingResponse;
import com.eyedontcare.backend.ping.service.PingService;

@RestController
@RequestMapping("/api/ping")
public class PingController {

	private final PingService pingService;

	public PingController(PingService pingService) {
		this.pingService = pingService;
	}

	@GetMapping
	public ResponseEntity<ApiResponse<PingResponse>> ping() {
		return ResponseEntity.ok(ApiResponse.success(pingService.ping()));
	}
}
