package com.eyedontcare.backend.waitingroom.service;

import java.util.UUID;
import com.eyedontcare.backend.waitingroom.entity.RoomType;
import com.eyedontcare.backend.waitingroom.repository.LeaveWaitingRoomResult;
import com.eyedontcare.backend.waitingroom.repository.RandomRoomLeaveResult;

public record WaitingRoomLeaveOutcome(
	RoomType roomType,
	UUID roomId,
	String participantKey,
	LeaveWaitingRoomResult inviteResult,
	RandomRoomLeaveResult randomResult
) {

	public static WaitingRoomLeaveOutcome invite(
		UUID roomId,
		String participantKey,
		LeaveWaitingRoomResult result
	) {
		return new WaitingRoomLeaveOutcome(
			RoomType.INVITE,
			roomId,
			participantKey,
			result,
			null
		);
	}

	public static WaitingRoomLeaveOutcome random(RandomRoomLeaveResult result) {
		return new WaitingRoomLeaveOutcome(
			RoomType.RANDOM,
			result.roomId(),
			result.quitterParticipantKey(),
			null,
			result
		);
	}
}
