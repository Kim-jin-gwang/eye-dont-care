package com.eyedontcare.backend.waitingroom.repository;

public enum UpdateCalibrationResult {

	UPDATED,
	UNCHANGED,
	ROOM_NOT_FOUND,
	PARTICIPANT_NOT_FOUND,
	STATE_CHANGE_NOT_ALLOWED,
	CORRUPTED
}
