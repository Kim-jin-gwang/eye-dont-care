package com.eyedontcare.backend.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import com.eyedontcare.backend.auth.dto.request.LoginRequest;
import com.eyedontcare.backend.auth.dto.request.ReissueRequest;
import com.eyedontcare.backend.auth.dto.request.SignupRequest;
import com.eyedontcare.backend.auth.dto.response.TokenResponse;
import com.eyedontcare.backend.auth.exception.AuthErrorCode;
import com.eyedontcare.backend.auth.repository.RefreshTokenStore;
import com.eyedontcare.backend.game.entity.Game;
import com.eyedontcare.backend.game.repository.GameRepository;
import com.eyedontcare.backend.gameresult.entity.GameResult;
import com.eyedontcare.backend.gameresult.entity.Outcome;
import com.eyedontcare.backend.gameresult.entity.Participant;
import com.eyedontcare.backend.gameresult.entity.ParticipantType;
import com.eyedontcare.backend.gameresult.repository.GameResultRepository;
import com.eyedontcare.backend.gameresult.repository.ParticipantRepository;
import com.eyedontcare.backend.global.error.BusinessException;
import com.eyedontcare.backend.user.entity.User;
import com.eyedontcare.backend.user.enums.ProfileImageCode;
import com.eyedontcare.backend.user.repository.UserRepository;

@SpringBootTest
@Transactional
class WithdrawalIntegrationTest {

    private static final String PASSWORD = "password123";

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RefreshTokenStore refreshTokenStore;

    @Autowired
    private GameRepository gameRepository;

    @Autowired
    private GameResultRepository gameResultRepository;

    @Autowired
    private ParticipantRepository participantRepository;

    private Long withdrawnUserId;
    private Long newUserId;

    @AfterEach
    void deleteRefreshTokens() {
        if (withdrawnUserId != null) {
            refreshTokenStore.deleteByUserId(withdrawnUserId);
        }
        if (newUserId != null) {
            refreshTokenStore.deleteByUserId(newUserId);
        }
    }

    @Test
    void 탈퇴_후_동일_이메일로_새_계정을_만들고_경기_기록을_보존한다() {
        String email =
            "withdrawal-" + UUID.randomUUID() + "@example.com";
        SignupRequest signupRequest =
            new SignupRequest(email, PASSWORD);

        TokenResponse oldTokens =
            authService.signup(signupRequest);

        User withdrawnUser = userRepository
            .findByEmailAndDeletedAtIsNull(email)
            .orElseThrow();
        withdrawnUserId = withdrawnUser.getId();

        Participant participant =
            saveGameResult(withdrawnUserId);

        authService.withdraw(withdrawnUserId);
        userRepository.flush();

        assertThat(withdrawnUser.getDeletedAt()).isNotNull();
        assertThat(withdrawnUser.getEmail()).isNull();
        assertThat(withdrawnUser.getPasswordHash()).isNull();
        assertThat(withdrawnUser.getNickname())
            .isEqualTo("withdrawn-" + withdrawnUserId);
        assertThat(withdrawnUser.getProfileImageCode())
            .isEqualTo(ProfileImageCode.PROFILE_1);
        assertThat(
            refreshTokenStore.findByUserId(withdrawnUserId)
        ).isEmpty();

        assertThatThrownBy(
            () -> authService.reissue(
                new ReissueRequest(oldTokens.refreshToken())
            )
        )
            .isInstanceOf(BusinessException.class)
            .satisfies(exception -> assertThat(
                ((BusinessException) exception).getErrorCode()
            ).isEqualTo(AuthErrorCode.INVALID_REFRESH_TOKEN));

        assertThatThrownBy(
            () -> authService.login(
                new LoginRequest(email, PASSWORD)
            )
        )
            .isInstanceOf(BusinessException.class)
            .satisfies(exception -> assertThat(
                ((BusinessException) exception).getErrorCode()
            ).isEqualTo(AuthErrorCode.INVALID_CREDENTIALS));

        authService.signup(signupRequest);

        User newUser = userRepository
            .findByEmailAndDeletedAtIsNull(email)
            .orElseThrow();
        newUserId = newUser.getId();
        userRepository.flush();

        assertThat(newUserId)
            .isNotEqualTo(withdrawnUserId);
        assertThat(
            userRepository.findAll().stream()
                .map(User::getId)
                .filter(id ->
                    id.equals(withdrawnUserId) ||
                    id.equals(newUserId)
                )
        ).containsExactlyInAnyOrder(
            withdrawnUserId,
            newUserId
        );

        Participant savedParticipant = participantRepository
            .findById(participant.getId())
            .orElseThrow();

        assertThat(
            gameResultRepository.existsById(
                savedParticipant.getGameResult().getId()
            )
        ).isTrue();
        assertThat(savedParticipant.getUserId())
            .isEqualTo(withdrawnUserId);
        assertThat(savedParticipant.getDisplayName())
            .isEqualTo("original-display-name");
    }

    private Participant saveGameResult(Long userId) {
        Game game = gameRepository.findAll()
            .stream()
            .findFirst()
            .orElseThrow();

        GameResult gameResult = GameResult.of(
            UUID.randomUUID(),
            game,
            Map.of("durationMs", 60_000),
            Instant.parse("2026-07-30T00:00:00Z"),
            Instant.parse("2026-07-30T00:01:00Z")
        );

        Participant participant = Participant.of(
            userId,
            ParticipantType.USER,
            1,
            Outcome.WIN,
            1,
            "original-display-name",
            null
        );

        gameResult.addParticipant(participant);
        gameResultRepository.saveAndFlush(gameResult);

        return participant;
    }
}
