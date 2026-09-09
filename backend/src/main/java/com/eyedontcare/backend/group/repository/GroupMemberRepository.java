package com.eyedontcare.backend.group.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.eyedontcare.backend.group.entity.GroupMember;

public interface GroupMemberRepository
	extends JpaRepository<GroupMember, Long> {

	boolean existsByGroupIdAndUserId(Long groupId, Long userId);

	Optional<GroupMember> findByGroupIdAndUserId(Long groupId, Long userId);

	int countByGroupId(Long groupId);

	List<GroupMember> findByGroupIdOrderByJoinedAtAsc(Long groupId);

	List<GroupMember> findByUserIdOrderByJoinedAtAsc(Long userId);

	void deleteByGroupId(Long groupId);
}
