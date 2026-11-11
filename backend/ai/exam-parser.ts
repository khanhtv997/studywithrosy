import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FORMAT_BY_VALUE } from '../../shared/exercise-formats';
import { normalizeTrueFalse } from '../../shared/grading';
import type { ExerciseFormat, Question, QuestionType } from '../../shared/types';

/** A question as returned by OCR; answerSource tells the teacher whether the key came from the document. */
export type OcrQuestion = Question & { answerSource?: 'document' | 'inferred' };
export interface ParsedExam { title: string; detectedGrade: string; questions: OcrQuestion[]; }

const QUESTION_TYPES: QuestionType[] = ['multiple_choice', 'fill_blank', 'reading_comprehension', 'sentence_transformation', 'true_false', 'essay'];
const DEFAULT_POINTS = 1;
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** Turns loosely shaped AI or parser output into questions the API accepts. */
export function normalizeQuestions(raw: unknown[]): OcrQuestion[] {
  const batch = randomUUID().slice(0, 8);
  return raw.flatMap((value, index): OcrQuestion[] => {
    const q = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const format = FORMAT_BY_VALUE.has(q.format as ExerciseFormat) ? q.format as ExerciseFormat : undefined;
    // The paper's numbering is ours to assign; papers print no stem for some formats (e.g. pronunciation).
    const text = str(q.text).replace(/^(?:Question|Câu)?\s*\d+\s*[.):]\s*/i, '').trim()
      || (format && !FORMAT_BY_VALUE.get(format)!.usesPassage ? FORMAT_BY_VALUE.get(format)!.template.text : '');
    if (!text) return [];
    const options = Array.isArray(q.options) ? q.options.map(str).filter(Boolean) : [];

    // The format decides how the answer is graded; fall back to the reported type, then to the shape.
    let type: QuestionType = format ? FORMAT_BY_VALUE.get(format)!.type
      : QUESTION_TYPES.includes(q.type as QuestionType) ? q.type as QuestionType
      : options.length ? 'multiple_choice' : 'fill_blank';
    if ((type === 'multiple_choice' || type === 'reading_comprehension') && options.length < 2) type = 'fill_blank';
    const hasOptions = type === 'multiple_choice' || type === 'reading_comprehension';

    const answer = str(q.correctAnswer);
    const correctAnswer = hasOptions ? (answer.match(/^[A-H]/i)?.[0].toUpperCase() ?? 'A')
      : type === 'true_false' ? (normalizeTrueFalse(answer) || 'T')
      : answer;
    const answerSource = q.answerSource === 'document' || q.answerSource === 'inferred' ? q.answerSource
      : answer ? undefined : 'inferred';

    return [{
      id: `q-${batch}-${index + 1}`,
      order: index + 1,
      text,
      type,
      format,
      options: hasOptions ? options : undefined,
      correctAnswer,
      grammarTopic: str(q.grammarTopic) || 'Ngữ pháp',
      explanation: str(q.explanation),
      points: typeof q.points === 'number' && q.points > 0 ? q.points : DEFAULT_POINTS,
      readingPassage: str(q.readingPassage) || undefined,
      answerSource,
    }];
  });
}

/** Offline fallback when Gemini is unavailable: reads "1. ... / A. ... / Answer: B" style text. */
export function parseTextToExam(rawText: string, title?: string, grade?: string): ParsedExam {
  const questions: { text: string; options: string[]; correctAnswer: string; explanation: string }[] = [];
  let current: (typeof questions)[number] | undefined;
  for (const line of rawText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    const match = line.match(/^(?:Câu\s*|Question\s*)?(\d+)[.):]\s*(.+)$/i);
    if (match) {
      if (current) questions.push(current);
      current = { text: match[2], options: [], correctAnswer: '', explanation: '' };
      continue;
    }
    const option = line.match(/^([A-D])[.):]\s*(.+)$/i);
    if (option && current) { current.options.push(`${option[1].toUpperCase()}. ${option[2]}`); continue; }
    const answer = line.match(/^(?:Answer|Đáp án)\s*[:.]\s*(.+)$/i);
    if (answer && current) { current.correctAnswer = answer[1].trim(); continue; }
    if (current && current.options.length === 0) current.text += ` ${line}`;
  }
  if (current) questions.push(current);
  if (!questions.length) throw new BadRequestException('Không tìm thấy câu hỏi trong nội dung đề thi');
  return {
    title: title || 'Đề kiểm tra tiếng Anh',
    detectedGrade: grade || '',
    questions: normalizeQuestions(questions.map(q => ({
      ...q,
      format: q.options.length ? 'grammar_vocab' : 'gap_fill',
      explanation: q.correctAnswer ? '' : 'Giáo viên cần kiểm tra đáp án trước khi giao bài.',
    }))),
  };
}

/** Text of a .docx file with underlines kept as <u>...</u> (needed for pronunciation and error questions). */
export async function docxToText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer }, { styleMap: ['u => u'] });
  return html
    .replace(/<\/(p|h\d|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<(?!\/?u>)[^>]+>/gi, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
