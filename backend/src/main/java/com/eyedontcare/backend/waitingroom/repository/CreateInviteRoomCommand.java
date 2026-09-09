package com.eyedontcare.backend.waitingroom.repository;

import java.time.Duration;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoom;
import com.eyedontcare.backend.waitingroom.entity.WaitingRoomParticipant;

public record CreateInviteRoomCommand(
	WaitingRoom room,
	WaitingRoomParticipant participant,
	Duration ttl
) {
}
