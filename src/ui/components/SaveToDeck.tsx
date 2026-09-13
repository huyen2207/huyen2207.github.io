import { useEffect, useState } from 'react';
import type { FlashcardKind } from '@/domain/flashcard';
import { flashcardId } from '@/domain/flashcard';
import { toggleFlashcard } from '@/app/services/flashcardService';
import { flashcardRepo } from '@/storage/repositories';
import { t } from '@/i18n/vi';

/** Nút "Lưu vào thẻ ôn" — dùng chung cho thẻ ngữ pháp và bảng so sánh. */
export function SaveToDeck({ kind, refId }: { kind: FlashcardKind; refId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void flashcardRepo.has(flashcardId(kind, refId)).then((v) => alive && setSaved(v));
    return () => {
      alive = false;
    };
  }, [kind, refId]);

  if (saved === null) return null;

  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => void toggleFlashcard(kind, refId, new Date()).then(setSaved)}
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
