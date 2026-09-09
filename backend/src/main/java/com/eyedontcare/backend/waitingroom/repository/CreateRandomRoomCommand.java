package com.eyedontcare.backend.waitingroom.repository;

import java.time.Duration;
import java.util.List;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoom;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoomParticipant;

public record CreateRandomRoomCommand(
	WaitingRoom room,
	List<WaitingRoomParticipant> participants,
	Duration ttl
) {
}
