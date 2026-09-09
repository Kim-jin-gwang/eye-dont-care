package com.eyedontcare.backend.user.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.eyedontcare.backend.user.entity.User;

public interface UserRepository extends JpaRepository<User, Long> {

    boolean existsByEmailAndDeletedAtIsNull(String email);

    boolean existsByNicknameAndDeletedAtIsNull(String nickname);

    boolean existsByNicknameAndIdNotAndDeletedAtIsNull(
        String nickname,
        Long excludedUserId
    );

    Optional<User> findByEmailAndDeletedAtIsNull(String email);

    Optional<User> findByIdAndDeletedAtIsNull(Long id);

    boolean existsByIdAndDeletedAtIsNull(Long id);
}
