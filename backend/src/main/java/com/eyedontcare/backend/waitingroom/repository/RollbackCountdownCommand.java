package com.eyedontcare.backend.waitingroom.repository;

import java.time.Duration;
import java.util.UUID;

public record RollbackCountdownCommand(
	UUID roomId,
	String roomCode,
	UUID countdownId,
	Duration activeTtl
) {
}
