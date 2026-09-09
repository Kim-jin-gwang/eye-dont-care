package com.eyedontcare.backend.group.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import com.eyedontcare.backend.group.entity.GroupPost;

public interface GroupPostRepository extends JpaRepository<GroupPost, Long> {

	List<GroupPost> findByGroupIdOrderByCreatedAtDesc(Long groupId);
}
