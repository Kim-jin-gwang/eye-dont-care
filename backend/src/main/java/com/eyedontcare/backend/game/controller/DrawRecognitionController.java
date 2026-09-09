package com.eyedontcare.backend.game.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.eyedontcare.backend.game.GameSuccessCode;
import com.eyedontcare.backend.game.dto.request.RecognizeDrawingRequest;
import com.eyedontcare.backend.game.dto.response.RecognizeDrawingResponse;
import com.eyedontcare.backend.game.service.DrawRecognitionService;
import com.eyedontcare.backend.global.common.response.ApiResponse;

/**
 * 눈으로 그리기 AI 채점 엔드포인트. 그린 이미지를 Vision API에 넘겨 판정 결과를 돌려준다.
 * 게스트도 플레이하므로 인증을 요구하지 않는다(SecurityConfig에서 permitAll).
 */
@RestController
@RequestMapping("/api/v1/games/draw")
public class DrawRecognitionController {

	private final DrawRecognitionService drawRecognitionService;

	public DrawRecognitionController(
		DrawRecognitionService drawRecognitionService
	) {
		this.drawRecognitionService = drawRecognitionService;
	}

	@PostMapping("/recognize")
	public ResponseEntity<ApiResponse<RecognizeDrawingResponse>> recognize(
		@Valid @RequestBody RecognizeDrawingRequest request
	) {
		RecognizeDrawingResponse response =
			drawRecognitionService.recognize(request);

		return ResponseEntity.ok(ApiResponse.success(
			GameSuccessCode.DRAWING_RECOGNIZED,
			response
		));
	}
}
