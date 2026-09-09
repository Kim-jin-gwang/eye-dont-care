package com.eyedontcare.backend.waitingroom.repository;

import java.util.UUID;
import com.eyedontcare.backend.game.entity.GameName;
import com.eyedontcare.backend.waitingroom.entity.RoomStatus;

public record RandomRoomLeaveResult(
	Status status,
	UUID roomId,
	GameName gameName,
	String quitterParticipantKey,
	String remainingParticipantKey,
	RoomStatus previousRoomStatus
) {

	public enum Status {
		CLOSED_NOW,
		ALREADY_CLOSED,
		NOT_JOINABLE,
		ROOM_NOT_FOUND,
		PARTICIPANT_NOT_FOUND,
		CORRUPTED
	}
}
