package com.eyedontcare.backend.game.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import com.eyedontcare.backend.game.entity.Game;
import com.eyedontcare.backend.game.entity.GameName;
import com.eyedontcare.backend.game.entity.PlayMode;

public interface GameRepository extends JpaRepository<Game, Long> {

	boolean existsByGameNameAndPlayMode(GameName gameName, PlayMode playMode);
}
