package com.eyedontcare.backend.ranking.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.util.List;
import com.eyedontcare.backend.game.entity.GameName;
import com.eyedontcare.backend.ranking.support.RankType;

/**
 * 게임별 전체 랭킹 응답(페이지네이션 + 내 순위).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GameRankingResponse(
	GameName gameName,
	RankType rankType,
	String unit,
	String period,
	LocalDate weekStart,
	List<RankingEntry> rankings,
	MyRank myRank,
	int page,
	int size,
	long totalElements,
	int totalPages
) {
}
