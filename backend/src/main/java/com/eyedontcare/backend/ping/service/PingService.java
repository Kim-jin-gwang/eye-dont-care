package com.eyedontcare.backend.ping.service;

import org.springframework.stereotype.Service;
import com.eyedontcare.backend.ping.dto.PingResponse;

@Service
public class PingService {

	public PingResponse ping() {
		return new PingResponse("pong");
	}
}
