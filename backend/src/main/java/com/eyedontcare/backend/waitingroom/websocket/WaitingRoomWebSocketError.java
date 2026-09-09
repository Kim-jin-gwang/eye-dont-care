package com.eyedontcare.backend.waitingroom.websocket;

import com.eyedontcare.backend.global.error.ErrorCode;

public record WaitingRoomWebSocketError(String code, String message) {

	public static WaitingRoomWebSocketError from(ErrorCode errorCode) {
		return new WaitingRoomWebSocketError(errorCode.code(), errorCode.message());
	}
}
