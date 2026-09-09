package com.eyedontcare.backend.guest.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.eyedontcare.backend.global.error.BusinessException;
import com.eyedontcare.backend.guest.config.GuestSessionProperties;
import com.eyedontcare.backend.guest.entity.GuestSession;
import com.eyedontcare.backend.guest.exception.GuestSessionErrorCode;
import com.eyedontcare.backend.guest.repository.GuestSessionStore;
import com.eyedontcare.backend.user.util.RandomNicknameGenerator;

@Service
public class GuestSessionService {

	private static final int MAX_ISSUE_ATTEMPTS = 3;

	private final GuestSessionStore guestSessionStore;
	private final RandomNicknameGenerator randomNicknameGenerator;
	private final Duration sessionTtl;
	private final Clock clock;
	private final Supplier<UUID> guestSessionIdSupplier;

	@Autowired
	public GuestSessionService(
		GuestSessionStore guestSessionStore,
		RandomNicknameGenerator randomNicknameGenerator,
		GuestSessionProperties properties
	) {
		this(
			guestSessionStore,
			randomNicknameGenerator,
			properties,
			Clock.systemUTC(),
			UUID::randomUUID
		);
	}

	GuestSessionService(
		GuestSessionStore guestSessionStore,
		RandomNicknameGenerator randomNicknameGenerator,
		GuestSessionProperties properties,
		Clock clock,
		Supplier<UUID> guestSessionIdSupplier
	) {
		this.guestSessionStore = guestSessionStore;
		this.randomNicknameGenerator = randomNicknameGenerator;
		this.sessionTtl = properties.sessionTtl();
		this.clock = clock;
		this.guestSessionIdSupplier = guestSessionIdSupplier;
	}

	public GuestSession issue() {
		for (int attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt++) {
			UUID guestSessionId = guestSessionIdSupplier.get();
			Instant createdAt = clock.instant();
			GuestSession guestSession = new GuestSession(
				guestSessionId,
				randomNicknameGenerator.generate(),
				createdAt,
				createdAt.plus(sessionTtl)
			);

			if (guestSessionStore.saveIfAbsent(guestSessionId, guestSession, sessionTtl)) {
				return guestSession;
			}
		}

		throw new BusinessException(GuestSessionErrorCode.GUEST_SESSION_STORE_UNAVAILABLE);
	}

	public Optional<GuestSession> findById(UUID guestSessionId) {
		return guestSessionStore.findById(guestSessionId);
	}

	public GuestSession validate(UUID guestSessionId) {
		return findById(guestSessionId)
			.orElseThrow(() ->
				new BusinessException(GuestSessionErrorCode.INVALID_GUEST_SESSION));
	}

	public boolean exists(UUID guestSessionId) {
		return findById(guestSessionId).isPresent();
	}

	public Optional<Duration> getRemainingTtl(UUID guestSessionId) {
		return guestSessionStore.getRemainingTtl(guestSessionId);
	}
}
