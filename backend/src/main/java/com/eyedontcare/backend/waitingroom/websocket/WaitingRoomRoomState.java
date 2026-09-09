package com.eyedontcare.backend.waitingroom.websocket;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import com.eyedontcare.backend.waitingroom.dto.response.WaitingRoomParticipantResponse;
import com.eyedontcare.backend.waitingroom.repository.WaitingRoomSnapshot;

public record WaitingRoomRoomState(
	UUID roomId,
	String roomType,
	String gameName,
	String roomCode,
	String roomStatus,
	Instant countdownEndsAt,
	List<WaitingRoomParticipantResponse> participants,
	Instant createdAt
) {

	public static WaitingRoomRoomState from(WaitingRoomSnapshot snapshot) {
		return new WaitingRoomRoomState(
			snapshot.room().roomId(),
			snapshot.room().roomType().name(),
			snapshot.room().gameName().name(),
			snapshot.room().roomCode(),
			snapshot.room().roomStatus().name(),
			snapshot.room().roomStatus() ==
				com.eyedontcare.backend.waitingroom.entity.RoomStatus.COUNTDOWN
				? snapshot.room().countdownEndsAt()
				: null,
			snapshot.participants().stream()
				.sorted(Comparator.comparingInt(participant -> participant.slotNo()))
				.map(WaitingRoomParticipantResponse::from)
				.toList(),
			snapshot.room().createdAt()
		);
	}
}
