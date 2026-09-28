import { useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { isStarred, toggleStar } from '@/app/services/starService';
import { t } from '@/i18n/vi';

/** Nút đánh dấu cần ôn thêm — dùng trong thẻ học và ở màn kết quả sau khi trả lời. */
export function StarToggle({ grammarId }: { grammarId: string }) {
  const ctx = useAppStore((s) => s.ctx);
  const [on, setOn] = useState(() => isStarred(ctx, grammarId));

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        if (!ctx) return;
        // Đổi giao diện ngay rồi mới ghi: bấm mà không thấy gì đổi thì tưởng hỏng.
        setOn((v) => !v);
        toggleStar(ctx, grammarId, new Date())
          .then(setOn)
          .catch(() => setOn((v) => !v));
      }}
      className="tap w-full rounded-lg border py-2.5 text-center text-[14px] hairline"
      style={{
        background: on ? 'var(--accent-soft)' : 'var(--paper-raised)',
        color: on ? 'var(--accent)' : 'var(--ink-soft)',
      }}
    >
      {on ? t('star.on') : t('star.off')}
    </button>
  );
}
