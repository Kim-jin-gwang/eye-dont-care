package com.eyedontcare.backend.waitingroom.repository;

import java.util.UUID;
import com.eyedontcare.backend.waitingroom.entity.RoomStatus;
import com.eyedontcare.backend.waitingroom.entity.RoomType;

public record WaitingRoomMetadata(
	UUID roomId,
	RoomType roomType,
	RoomStatus roomStatus,
	String roomCode
) {
}
