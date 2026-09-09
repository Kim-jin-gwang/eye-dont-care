package com.eyedontcare.backend.waitingroom.repository.model;

import java.time.Instant;
import com.eyedontcare.backend.waitingroom.entity.CalibrationStatus;
import com.eyedontcare.backend.waitingroom.entity.RoomRole;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoomParticipant;

public record StoredParticipant(
	String displayName,
	String roomRole,
	int slotNo,
	boolean isReady,
	String calibrationStatus,
	Instant joinedAt
) {

	public static StoredParticipant from(WaitingRoomParticipant participant) {
		return new StoredParticipant(
			participant.displayName(),
			participant.roomRole().name(),
			participant.slotNo(),
			participant.isReady(),
			participant.calibrationStatus().name(),
			participant.joinedAt()
		);
	}

	public static StoredParticipant joining(String displayName, Instant joinedAt) {
		return new StoredParticipant(
			displayName,
			RoomRole.PLAYER.name(),
			0,
			false,
			CalibrationStatus.PENDING.name(),
			joinedAt
		);
	}

	public WaitingRoomParticipant toParticipant(String participantKey) {
		return new WaitingRoomParticipant(
			participantKey,
			displayName,
			RoomRole.valueOf(roomRole),
			slotNo,
			isReady,
			CalibrationStatus.valueOf(calibrationStatus),
			joinedAt
		);
	}
}
