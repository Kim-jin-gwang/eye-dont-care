package com.eyedontcare.backend.ping.service;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import com.eyedontcare.backend.global.error.BusinessException;
import com.eyedontcare.backend.ping.exception.PingErrorCode;

@Profile("dev")
@Service
public class ErrorPingService {

	public void throwBusinessException() {
		throw new BusinessException(PingErrorCode.BUSINESS_ERROR);
	}

	public void throwUnexpectedException() {
		throw new IllegalStateException("errorPing에서 의도적으로 발생시킨 내부 예외입니다.");
	}
}
