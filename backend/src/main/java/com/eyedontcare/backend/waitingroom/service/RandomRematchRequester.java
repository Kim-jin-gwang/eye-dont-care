package com.eyedontcare.backend.waitingroom.service;

import java.util.UUID;
import com.eyedontcare.backend.game.entity.GameName;

public interface RandomRematchRequester {

	RandomRematchRequestResult requeueRemaining(
		UUID previousRoomId,
		GameName gameName,
		String participantKey
	);
}
