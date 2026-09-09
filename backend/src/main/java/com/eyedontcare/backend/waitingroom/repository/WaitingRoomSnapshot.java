package com.eyedontcare.backend.waitingroom.repository;

import java.util.List;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoom;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoomParticipant;

public record WaitingRoomSnapshot(
	WaitingRoom room,
	List<WaitingRoomParticipant> participants
) {

	public WaitingRoomSnapshot {
		participants = List.copyOf(participants);
	}
}
