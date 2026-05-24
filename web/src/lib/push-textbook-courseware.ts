import {

  fetchTextbookCoursewareMatch,

  type TextbookAlignmentDto,

} from './video-learn-api';

import type { TextbookTrackDto } from './learning-progress-api';
import { emitWuxianEventUntyped, openToolViaEvent, WUXIAN_EVENTS } from './wuxian-events';



export async function pushTextbookCoursewareMatch(

  userId: string,

  book: TextbookTrackDto,

): Promise<TextbookAlignmentDto | null> {

  const alignment = await fetchTextbookCoursewareMatch(userId, book.catalogId, book.progressChapter);

  if (!alignment) return null;



  openToolViaEvent('video-learn');

  emitWuxianEventUntyped(WUXIAN_EVENTS.coursewarePrefill, {
    alignment,
    highlightCatalogId: book.catalogId,
    autoStart: true,
  });

  return alignment;

}

