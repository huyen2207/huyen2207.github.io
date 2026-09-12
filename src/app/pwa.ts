/**
 * Nạp bản mới sau khi deploy.
 *
 * Service worker precache cả `index.html`, nên lần tải lại ĐẦU TIÊN sau khi deploy vẫn
 * nhận bundle CŨ: bản mới mới chỉ vừa cài xong ở nền. Người học phải tải lại LẦN HAI mới
 * thấy thay đổi — mà không có gì báo cho họ biết điều đó. Hậu quả: sửa xong, deploy xong,
 * người học vẫn gặp y nguyên lỗi cũ và tưởng là chưa sửa.
 *
 * SW đã bật `skipWaiting` + `clientsClaim` nên khi bản mới giành quyền điều khiển,
 * `controllerchange` bắn — lúc đó tự tải lại một lần.
 *
 * KHÔNG tải lại giữa lúc đang làm bài: vị trí trong buổi học nằm ở state React, tải lại
 * là mất chỗ đang đứng. Đợi người học rời khỏi màn hình làm bài rồi mới nạp.
 */
const IN_SESSION = /^\/(session|mock|practice|review|trap-lab|compare|placement)/;

export function watchForNewVersion(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Lần đầu cài SW cũng bắn `controllerchange` — đó không phải bản mới, đừng tải lại.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let pending = false;
  let reloading = false;

  const apply = () => {
    if (reloading || !pending) return;
    if (IN_SESSION.test(window.location.pathname)) return;
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    pending = true;
    apply();
  });

  // Rời màn hình làm bài, hoặc quay lại app sau khi chuyển tab → thử nạp lại.
  window.addEventListener('popstate', apply);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
  window.setInterval(apply, 10_000);
}

/**
 * Nút thoát hiểm ở /settings: xoá bộ nhớ đệm của service worker rồi nạp lại.
 * KHÔNG đụng tới IndexedDB — dữ liệu học nằm ở đó và phải giữ nguyên.
 */
export async function forceUpdate(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}

