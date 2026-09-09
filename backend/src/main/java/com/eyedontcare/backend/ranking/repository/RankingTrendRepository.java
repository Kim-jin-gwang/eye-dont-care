package com.eyedontcare.backend.ranking.repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.eyedontcare.backend.game.entity.GameName;
import com.eyedontcare.backend.ranking.entity.RankingTrend;

public interface RankingTrendRepository extends JpaRepository<RankingTrend, Long> {

	Optional<RankingTrend> findByUserIdAndGameNameAndWeekStart(
		Long userId,
		GameName gameName,
		LocalDate weekStart
	);

	List<RankingTrend> findByGameNameAndWeekStartAndUserIdIn(
		GameName gameName,
		LocalDate weekStart,
		Collection<Long> userIds
	);
}
