package com.eyedontcare.backend.gameresult.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.eyedontcare.backend.gameresult.dto.response.GameResultDetailResponse;
import com.eyedontcare.backend.gameresult.dto.response.MyGameResultPageResponse;
import com.eyedontcare.backend.gameresult.entity.GameResult;
import com.eyedontcare.backend.gameresult.entity.Participant;
import com.eyedontcare.backend.gameresult.exception.GameResultErrorCode;
import com.eyedontcare.backend.gameresult.repository.GameResultRepository;
import com.eyedontcare.backend.gameresult.repository.ParticipantRepository;
import com.eyedontcare.backend.global.error.BusinessException;

/**
 * 경기 기록 조회 서비스.
 *
 * <p>제출은 쓰기 트랜잭션, 조회는 읽기 전용이라 {@link GameResultService}와 분리했다.
 * 인증된 회원 ID로만 자신의 기록을 조회한다.
 */
@Service
public class GameResultQueryService {

	private final GameResultRepository gameResultRepository;
	private final ParticipantRepository participantRepository;

	public GameResultQueryService(
		GameResultRepository gameResultRepository,
		ParticipantRepository participantRepository
	) {
		this.gameResultRepository = gameResultRepository;
		this.participantRepository = participantRepository;
	}

	@Transactional(readOnly = true)
	public MyGameResultPageResponse getMyResults(Long userId, int page, int size) {
		Pageable pageable = PageRequest.of(page - 1, size);

		Page<Participant> myResults = participantRepository.findMyResults(userId, pageable);

		return MyGameResultPageResponse.from(myResults);
	}

	@Transactional(readOnly = true)
	public GameResultDetailResponse getResult(Long userId, Long resultId) {
		GameResult gameResult = gameResultRepository.findById(resultId)
			.orElseThrow(() -> new BusinessException(GameResultErrorCode.RESULT_NOT_FOUND));

		Participant myParticipant = participantRepository.findByResultIdAndUserId(resultId, userId)
			.orElseThrow(() -> new BusinessException(GameResultErrorCode.RESULT_ACCESS_DENIED));

		return GameResultDetailResponse.from(gameResult, myParticipant.getSlotNo());
	}
}
