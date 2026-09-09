package com.eyedontcare.backend.game.dto.response;

import com.eyedontcare.backend.game.entity.Game;
import com.eyedontcare.backend.game.entity.GameName;
import com.eyedontcare.backend.game.entity.PlayMode;

public record GameDetailResponse(
	Long gameId,
	GameName gameName,
	PlayMode playMode,
	Integer difficulty
) {

	public static GameDetailResponse from(Game game) {
		return new GameDetailResponse(
			game.getId(),
			game.getGameName(),
			game.getPlayMode(),
			game.getDifficulty()
		);
	}
}
