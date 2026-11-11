import type { ExerciseFormat, Question, QuestionType, SchoolLevel } from './types';

export interface ExerciseFormatInfo {
  value: ExerciseFormat;
  label: string;
  /** How the answer is captured and graded. */
  type: QuestionType;
  /** Levels where the format usually appears; teachers can still use any format. */
  levels: SchoolLevel[];
  /** Instruction shown to students above the question, as in Vietnamese exam papers. */
  instruction: string;
  /** Questions of this format usually share a passage (cloze, reading). */
  usesPassage?: boolean;
  /** Starting point when a teacher adds a question of this format by hand. */
  template: Pick<Question, 'text' | 'correctAnswer' | 'grammarTopic'> & Partial<Pick<Question, 'options' | 'readingPassage' | 'explanation'>>;
}

const BOTH: SchoolLevel[] = ['THCS', 'THPT'];

/**
 * English exercise formats used in Vietnamese lower (THCS) and upper (THPT) secondary tests.
 * Text may mark underlined parts with <u>...</u>; the UI renders only that tag.
 */
export const EXERCISE_FORMATS: ExerciseFormatInfo[] = [
  { value: 'pronunciation', label: 'Phát âm', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn từ có phần gạch chân được phát âm khác với các từ còn lại.',
    template: { text: 'Choose the word whose underlined part is pronounced differently.', options: ['A. h<u>ou</u>se', 'B. m<u>ou</u>se', 'C. c<u>ou</u>ntry', 'D. m<u>ou</u>th'], correctAnswer: 'C', grammarTopic: 'Pronunciation: /aʊ/ vs /ʌ/' } },
  { value: 'stress', label: 'Trọng âm', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn từ có trọng âm chính rơi vào vị trí khác với các từ còn lại.',
    template: { text: 'Choose the word that differs from the others in the position of primary stress.', options: ['A. teacher', 'B. student', 'C. address', 'D. doctor'], correctAnswer: 'C', grammarTopic: 'Word stress' } },
  { value: 'grammar_vocab', label: 'Ngữ pháp & từ vựng', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn đáp án đúng để hoàn thành câu.',
    template: { text: 'She ___ to London last summer.', options: ['A. goes', 'B. went', 'C. has gone', 'D. will go'], correctAnswer: 'B', grammarTopic: 'Past Simple' } },
  { value: 'synonym', label: 'Từ đồng nghĩa', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn từ/cụm từ GẦN NGHĨA NHẤT với phần gạch chân.',
    template: { text: 'The film was so <u>boring</u> that I fell asleep.', options: ['A. dull', 'B. exciting', 'C. funny', 'D. scary'], correctAnswer: 'A', grammarTopic: 'Synonyms' } },
  { value: 'antonym', label: 'Từ trái nghĩa', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn từ/cụm từ TRÁI NGHĨA với phần gạch chân.',
    template: { text: 'He is very <u>generous</u> with his friends.', options: ['A. kind', 'B. mean', 'C. friendly', 'D. honest'], correctAnswer: 'B', grammarTopic: 'Antonyms' } },
  { value: 'error_identification', label: 'Tìm lỗi sai', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn phần gạch chân cần sửa để câu đúng.',
    template: { text: '<u>My brother</u> (A) <u>have</u> (B) lived <u>in</u> (C) Hanoi <u>since</u> (D) 2015.', options: ['A. My brother', 'B. have', 'C. in', 'D. since'], correctAnswer: 'B', grammarTopic: 'Subject-verb agreement', explanation: '"My brother" là ngôi thứ ba số ít → has lived.' } },
  { value: 'communication', label: 'Giao tiếp / tình huống', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn câu đáp phù hợp nhất cho tình huống giao tiếp.',
    template: { text: 'Tom: "Would you like some more coffee?" – Mary: "___"', options: ['A. Yes, I would.', 'B. No, thanks. I\'ve had enough.', 'C. I don\'t mind.', 'D. That\'s right.'], correctAnswer: 'B', grammarTopic: 'Communication: offers' } },
  { value: 'closest_meaning', label: 'Câu gần nghĩa nhất', type: 'multiple_choice', levels: ['THPT'],
    instruction: 'Chọn câu có nghĩa gần nhất với câu đã cho.',
    template: { text: 'I last saw him three years ago.', options: ['A. I have seen him for three years.', 'B. I haven\'t seen him for three years.', 'C. I didn\'t see him three years ago.', 'D. I saw him for three years.'], correctAnswer: 'B', grammarTopic: 'Present Perfect' } },
  { value: 'sentence_combination', label: 'Kết hợp câu', type: 'multiple_choice', levels: ['THPT'],
    instruction: 'Chọn câu kết hợp đúng nhất hai câu đã cho.',
    template: { text: 'He was tired. He kept working.', options: ['A. Although he was tired, he kept working.', 'B. Because he was tired, he kept working.', 'C. He was tired, so he kept working.', 'D. If he was tired, he kept working.'], correctAnswer: 'A', grammarTopic: 'Concession clauses' } },
  { value: 'arrangement', label: 'Sắp xếp câu / đoạn', type: 'multiple_choice', levels: BOTH,
    instruction: 'Chọn thứ tự đúng để tạo thành đoạn hội thoại/đoạn văn hoàn chỉnh.',
    template: { text: 'a. Hi, Lan. I\'m fine, thanks.\nb. Hello, Mai. How are you?\nc. Great. See you at school!', options: ['A. b – a – c', 'B. a – b – c', 'C. c – a – b', 'D. b – c – a'], correctAnswer: 'A', grammarTopic: 'Discourse ordering' } },
  { value: 'cloze', label: 'Điền từ vào đoạn văn', type: 'reading_comprehension', levels: BOTH, usesPassage: true,
    instruction: 'Đọc đoạn văn và chọn đáp án đúng cho mỗi chỗ trống.',
    template: { readingPassage: 'Many students in Vietnam learn English (1) ___ primary school.', text: '(1)', options: ['A. at', 'B. from', 'C. on', 'D. in'], correctAnswer: 'B', grammarTopic: 'Prepositions' } },
  { value: 'reading_mc', label: 'Đọc hiểu trắc nghiệm', type: 'reading_comprehension', levels: BOTH, usesPassage: true,
    instruction: 'Đọc đoạn văn và chọn đáp án đúng.',
    template: { readingPassage: 'Paste the reading passage here.', text: 'What is the passage mainly about?', options: ['A. ', 'B. ', 'C. ', 'D. '], correctAnswer: 'A', grammarTopic: 'Reading: main idea' } },
  { value: 'reading_true_false', label: 'Đọc hiểu Đúng / Sai', type: 'true_false', levels: BOTH, usesPassage: true,
    instruction: 'Đọc đoạn văn và cho biết câu sau Đúng (True) hay Sai (False).',
    template: { readingPassage: 'Paste the reading passage here.', text: 'The writer lives in a big city.', correctAnswer: 'T', grammarTopic: 'Reading: details' } },
  { value: 'gap_fill', label: 'Điền từ vào chỗ trống', type: 'fill_blank', levels: BOTH,
    instruction: 'Điền một từ thích hợp vào chỗ trống.',
    template: { text: 'I have lived here ___ 2010.', correctAnswer: 'since', grammarTopic: 'Prepositions of time' } },
  { value: 'word_form', label: 'Dạng đúng của từ', type: 'fill_blank', levels: BOTH,
    instruction: 'Viết dạng đúng của từ trong ngoặc.',
    template: { text: 'She is a very ___ student. (CARE)', correctAnswer: 'careful', grammarTopic: 'Word formation: adjectives' } },
  { value: 'verb_form', label: 'Chia động từ', type: 'fill_blank', levels: BOTH,
    instruction: 'Chia động từ trong ngoặc ở thì/dạng đúng.',
    template: { text: 'If it (rain) ___ tomorrow, we will stay at home.', correctAnswer: 'rains', grammarTopic: 'Conditional Type 1' } },
  { value: 'sentence_transformation', label: 'Viết lại câu', type: 'sentence_transformation', levels: BOTH,
    instruction: 'Viết lại câu sao cho nghĩa không đổi, bắt đầu bằng từ gợi ý.',
    template: { text: 'They built this bridge in 1990. → This bridge ...', correctAnswer: 'This bridge was built in 1990.', grammarTopic: 'Passive voice' } },
  { value: 'sentence_building', label: 'Dựng câu từ gợi ý', type: 'sentence_transformation', levels: BOTH,
    instruction: 'Dùng từ gợi ý để viết thành câu hoàn chỉnh.',
    template: { text: 'I / go / school / bus / every day.', correctAnswer: 'I go to school by bus every day.', grammarTopic: 'Present Simple' } },
  { value: 'writing', label: 'Viết đoạn văn / bài luận', type: 'essay', levels: BOTH,
    instruction: 'Viết đoạn văn theo yêu cầu. Giáo viên sẽ chấm phần này.',
    template: { text: 'Write a paragraph (100–120 words) about your favourite hobby.', correctAnswer: '', grammarTopic: 'Writing: paragraph' } },
];

export const FORMAT_BY_VALUE = new Map(EXERCISE_FORMATS.map(f => [f.value, f]));

export function formatInfo(format: ExerciseFormat | undefined): ExerciseFormatInfo | undefined {
  return format ? FORMAT_BY_VALUE.get(format) : undefined;
}

/** Guesses the school level from a class grade such as "Lớp 10 (THPT)". */
export function levelFromGrade(grade: string | undefined): SchoolLevel {
  if (!grade) return 'THCS';
  if (/THPT|\b1[0-2]\b|IELTS/i.test(grade)) return 'THPT';
  return 'THCS';
}
