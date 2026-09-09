package com.eyedontcare.backend.game.dto.response;

import com.eyedontcare.backend.game.entity.Game;
import com.eyedontcare.backend.game.entity.GameName;
import com.eyedontcare.backend.game.entity.PlayMode;

public record GameSummaryResponse(
	Long gameId,
	GameName gameName,
	PlayMode playMode
) {

	public static GameSummaryResponse from(Game game) {
		return new GameSummaryResponse(game.getId(), game.getGameName(), game.getPlayMode());
	}
}
