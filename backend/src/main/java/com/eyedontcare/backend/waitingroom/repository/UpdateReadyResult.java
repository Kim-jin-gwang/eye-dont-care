package com.eyedontcare.backend.waitingroom.repository;

public enum UpdateReadyResult {

	UPDATED,
	UNCHANGED,
	ROOM_NOT_FOUND,
	PARTICIPANT_NOT_FOUND,
	CALIBRATION_REQUIRED,
	STATE_CHANGE_NOT_ALLOWED,
	CORRUPTED
}
