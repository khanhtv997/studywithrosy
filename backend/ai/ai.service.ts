import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { EXERCISE_FORMATS } from '../../shared/exercise-formats';
import { validate } from '../common/validate';
import { analysisSchema, feedbackSchema, ocrSchema } from './ai.dto';
import { docxToText, normalizeQuestions, parseTextToExam } from './exam-parser';
import { AiKeysService, classifyKeyError } from './ai-keys.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The exercise catalogue as a prompt section, so the model and the app share one list. */
const FORMAT_GUIDE = EXERCISE_FORMATS
  .map(f => `- ${f.value} (${f.label}; answer type ${f.type}${f.usesPassage ? '; uses a passage' : ''}): ${f.instruction}`)
  .join('\n');

const OCR_PROMPT = (title: string, level: string, grade: string) => `You extract English tests used in Vietnamese lower (THCS) and upper (THPT) secondary schools into structured questions.
School level: ${level || 'unknown'}. Class: ${grade || 'unknown'}. Suggested title: ${title || 'none'}.

Exercise formats (use the "format" field with one of these values):
${FORMAT_GUIDE}

Rules:
1. Extract EVERY numbered question in the original order. Do not skip, merge or invent questions.
2. Pick the format from the section instruction (e.g. "Mark the letter A, B, C or D to indicate the word whose underlined part differs in pronunciation" = pronunciation, "...CLOSEST in meaning to the underlined word" = synonym, "...OPPOSITE in meaning" = antonym, "...needs correction" = error_identification, "Read the following passage..." = reading_mc or cloze, "True or False" = reading_true_false, "Give the correct form of the word" = word_form, "Rewrite the sentences" = sentence_transformation, "Write a paragraph" = writing).
3. Keep underlined text by wrapping it in <u>...</u>, both in the question and in the options. Use no other markup.
4. For passage sections (cloze, reading_mc, reading_true_false), copy the FULL passage into readingPassage of every question of that section. For cloze, the question text is the blank number, e.g. "(1)".
4b. Never put the question number in "text". When the paper prints no stem (typical for pronunciation and stress), use a short English stem such as "Choose the word whose underlined part is pronounced differently."
5. Options are written "A. ...", "B. ...". Only choice formats have options; reading_true_false has none.
6. correctAnswer: the option letter for choice formats, "T" or "F" for reading_true_false, the full expected answer for gap_fill/word_form/verb_form/sentence_transformation/sentence_building (separate several acceptable answers with " / "), and "" for writing.
7. If the document contains an answer key, use it and set answerSource "document". Otherwise solve the question yourself and set answerSource "inferred".
8. grammarTopic: a short English label such as "Present Perfect" or "Word stress". explanation: one short sentence in Vietnamese explaining the answer.
9. Ignore page headers, footers, scores and student-information lines.`;

const OCR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    detectedGrade: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          order: { type: Type.INTEGER },
          format: { type: Type.STRING, enum: EXERCISE_FORMATS.map(f => f.value) },
          text: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          answerSource: { type: Type.STRING, enum: ['document', 'inferred'] },
          grammarTopic: { type: Type.STRING },
          explanation: { type: Type.STRING },
          readingPassage: { type: Type.STRING },
        },
        required: ['order', 'format', 'text', 'correctAnswer', 'answerSource', 'grammarTopic'],
      },
    },
  },
  required: ['title', 'questions'],
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /** Models tried in order; the next one is used when one is overloaded, failing or too slow. */
  readonly models = (process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-3-flash-preview')
    .split(',').map(m => m.trim()).filter(Boolean);

  constructor(@Inject(AiKeysService) private readonly keys: AiKeysService) {}

  /**
   * Calls Gemini, trying keys in the admin's priority order and models in GEMINI_MODEL order.
   * A key that is out of quota or rejected is put to rest and the next key is tried;
   * an overloaded or slow model moves on to the next model with the same key.
   */
  private async generate(contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
    config: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<{ text: string; model: string } | null> {
    for (const key of await this.keys.usableKeys()) {
      let keyFailed = false;
      for (const model of this.models) {
        try {
          const response = await key.client.models.generateContent({ model, contents, config: { ...config, abortSignal: AbortSignal.timeout(timeoutMs) } });
          if (response.text?.trim()) {
            await this.keys.recordSuccess(key.id);
            return { text: response.text, model };
          }
          this.logger.warn(`${model} returned an empty response`);
        } catch (error) {
          const kind = classifyKeyError(error);
          this.logger.warn(`${key.label} / ${model} failed (${kind}): ${String(error).slice(0, 200)}`);
          if (kind !== 'other') {
            await this.keys.recordFailure(key.id, kind, error);
            keyFailed = true;
            break; // switch to the next key
          }
        }
      }
      // Every model failed for reasons that are not this key's (overload, timeout): other keys would fail the same way.
      if (!keyFailed) break;
    }
    return null;
  }

  private async hasKeys() { return (await this.keys.usableKeys()).length > 0; }

  async ocr(body: unknown) {
    const data = validate(ocrSchema, body);
    const fileData = data.imageBase64?.replace(/^data:[^;]+;base64,/, '');
    let text = data.rawText?.trim() || '';
    let binary: { mimeType: string; data: string } | null = null;

    if (fileData) {
      if (data.mimeType === DOCX_MIME) {
        // Word files are read locally; only their text goes to the model.
        try { text = [text, await docxToText(Buffer.from(fileData, 'base64'))].filter(Boolean).join('\n\n'); }
        catch { throw new BadRequestException('Không đọc được tệp Word. Hãy lưu lại dạng .docx hoặc xuất PDF.'); }
        if (!text) throw new BadRequestException('Tệp Word không có nội dung chữ.');
      } else if (data.mimeType === 'text/plain') {
        text = [text, Buffer.from(fileData, 'base64').toString('utf8')].filter(Boolean).join('\n\n');
      } else {
        binary = { mimeType: data.mimeType || 'image/jpeg', data: fileData };
      }
    }

    if (await this.hasKeys()) {
      try {
        const parts: ({ inlineData: { mimeType: string; data: string } } | { text: string })[] = [];
        if (binary) parts.push({ inlineData: binary });
        parts.push({ text: `${OCR_PROMPT(data.examTitle || '', data.level || '', data.gradeLevel || '')}${text ? `\n\nDocument text:\n${text}` : ''}` });
        // Long scanned exams can take a while; allow up to three minutes per model.
        const result = await this.generate([{ role: 'user', parts }],
          { responseMimeType: 'application/json', responseSchema: OCR_SCHEMA, temperature: 0.1 }, 180_000);
        const parsed = result ? JSON.parse(result.text) : {};
        const questions = normalizeQuestions(Array.isArray(parsed.questions) ? parsed.questions : []);
        if (result && questions.length) {
          return { success: true, source: result.model, data: {
            title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : data.examTitle || 'Đề kiểm tra tiếng Anh',
            detectedGrade: typeof parsed.detectedGrade === 'string' ? parsed.detectedGrade : data.gradeLevel || '',
            questions,
          } };
        }
        this.logger.warn('OCR AI returned no questions');
      } catch (error) { this.logger.warn(`OCR AI failed: ${String(error)}`); }
    }
    if (!text) {
      throw new BadRequestException(await this.hasKeys()
        ? 'Không tách được câu hỏi từ ảnh/PDF. Hãy thử ảnh rõ hơn hoặc dán nội dung đề.'
        : 'Chưa có khoá API AI nào dùng được (chưa cấu hình, hết hạn mức hoặc bị lỗi). Quản trị viên kiểm tra ở màn "Khoá API AI", hoặc dán nội dung đề / tải tệp Word.');
    }
    return { success: true, data: parseTextToExam(text, data.examTitle ?? undefined, data.gradeLevel ?? undefined), source: 'text_parser' };
  }

  async feedback(body: unknown) {
    const data = validate(feedbackSchema, body);
    const topic = data.weakQuestions[0]?.grammarTopic || 'các câu còn sai';
    const fallback = `Em đã hoàn thành bài ${data.assessmentTitle || 'kiểm tra'} với ${data.score}/10. Hãy xem lại ${topic}, làm thêm vài câu cùng dạng và hỏi giáo viên nếu còn vướng mắc.`;
    try {
      const response = await this.generate(`Viết nhận xét tiếng Việt ngắn gọn, khích lệ và nêu hướng ôn tập cụ thể cho học sinh ${data.studentName || ''}. Bài: ${data.assessmentTitle || ''}. Điểm: ${data.score}/10. Câu sai: ${JSON.stringify(data.weakQuestions)}.`);
      return { success: true, feedback: response?.text.trim() || fallback };
    } catch (error) { this.logger.warn(`Feedback AI failed: ${String(error)}`); return { success: true, feedback: fallback }; }
  }

  async analysis(body: unknown) {
    const data = validate(analysisSchema, body);
    const topic = data.weakTopics[0]?.topic || 'ngữ pháp cơ bản';
    const fallback = `Điểm trung bình là ${data.avgScore}/10 trên ${data.totalStudents} bài nộp. Nên ôn lại ${topic} và luyện thêm các câu học sinh thường làm sai.`;
    try {
      const response = await this.generate(`Phân tích ngắn gọn kết quả lớp bằng tiếng Việt và đề xuất hoạt động ôn tập. Bài: ${data.assessmentTitle || ''}. Điểm trung bình: ${data.avgScore}/10. Số bài: ${data.totalStudents}. Chủ đề yếu: ${JSON.stringify(data.weakTopics)}. Câu sai nhiều: ${JSON.stringify(data.topWrongQuestions)}.`);
      return { success: true, analysis: response?.text.trim() || fallback };
    } catch (error) { this.logger.warn(`Analysis AI failed: ${String(error)}`); return { success: true, analysis: fallback }; }
  }
}
