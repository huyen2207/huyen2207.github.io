import { useEffect, useState } from 'react';
import type { FlashcardKind } from '@/domain/flashcard';
import { flashcardId } from '@/domain/flashcard';
import { toggleFlashcard } from '@/app/services/flashcardService';
import { flashcardRepo } from '@/storage/repositories';
import { t } from '@/i18n/vi';

/** Nút "Lưu vào thẻ ôn" — dùng chung cho thẻ ngữ pháp và bảng so sánh. */
export function SaveToDeck({ kind, refId }: { kind: FlashcardKind; refId: string }) {
  // Mặc định HIỆN NGAY ở trạng thái chưa lưu. Bản đầu chờ đọc xong DB mới hiện, nên chỉ cần
  // một lần đọc lỗi hoặc treo (nâng cấp DB bị tab khác giữ) là nút biến mất không dấu vết.
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    flashcardRepo
      .has(flashcardId(kind, refId))
      .then((v) => alive && setSaved(v))
      .catch(() => alive && setSaved(false));
    return () => {
      alive = false;
    };
  }, [kind, refId]);

  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        // Đổi giao diện ngay rồi mới ghi — bấm mà không thấy gì đổi thì người học tưởng hỏng.
        setSaved((v) => !v);
        toggleFlashcard(kind, refId, new Date())
          .then(setSaved)
          .catch(() => setSaved((v) => !v));
      }}
      className="tap w-full rounded-lg border py-2.5 text-center text-[14px] hairline"
      style={{
        background: saved ? 'var(--accent-soft)' : 'var(--paper-raised)',
        color: saved ? 'var(--accent)' : 'var(--ink-soft)',
      }}
    >
      {saved ? t('deck.saved') : t('deck.save')}
    </button>
  );
}
