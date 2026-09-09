import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/styles/tokens.css'
import './assets/styles/reset.css'
import './assets/styles/global.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { ensureIdentity } from './api/identity'

// 라이브 데모 빌드(`vite build --mode demo`)에서는 백엔드 대신 브라우저 안의 목 백엔드를 먼저 설치한다.
// 일반 빌드에서는 이 분기가 제거되어 앱 코드에 영향이 없다.
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  const { installDemoBackend } = await import('./demo/install')
  installDemoBackend()
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 저장된 토큰이 있으면 새로고침 후에도 로그인을 복원한다(비동기 — 마운트를 막지 않는다).
void useAuthStore().restoreSession()

// 신원이 없는 방문자(비로그인 + 게스트 세션 미발급)에게 게스트 세션을 미리 확보해 둔다. 이게
// 없으면 솔로·AI 모드에서 참가자 키를 만들 수 없어 게임 진입과 결과 저장이 막힌다. 회원 토큰이
// 있으면 즉시 반환되므로 네트워크 호출이 일어나지 않는다.
void ensureIdentity()

app.mount('#app')
