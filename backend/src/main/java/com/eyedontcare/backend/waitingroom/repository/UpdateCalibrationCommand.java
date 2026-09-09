package com.eyedontcare.backend.waitingroom.repository;

import java.time.Duration;
import java.util.UUID;
import com.eyedontcare.backend.waitingroom.entity.CalibrationStatus;

public record UpdateCalibrationCommand(
	UUID roomId,
	String roomCode,
	String participantKey,
	CalibrationStatus calibrationStatus,
	int maxParticipants,
	Duration activeTtl
) {
}
