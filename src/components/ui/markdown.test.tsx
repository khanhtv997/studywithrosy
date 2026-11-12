import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown';
import { plainText } from '../../../backend/ai/plain-text';

const SAMPLE = `Dưới đây là phân tích ngắn gọn kết quả bài làm **"REVISION FOR 1ST TERM TEST GRADE 6"** và đề xuất.

---

### I. PHÂN TÍCH KẾT QUẢ BÀI LÀM

1. **Tổng quan:**
* **Số lượng bài nộp:** 01 bài *(mẫu khảo sát nhỏ)*.
* **Điểm trung bình:** 10/10

> Ghi chú: dùng \`Present Simple\`.`;

test('AI Markdown becomes headings, bold, lists and rules instead of raw symbols', () => {
  const html = renderToStaticMarkup(<Markdown text={SAMPLE} />);
  assert.match(html, /<strong>&quot;REVISION FOR 1ST TERM TEST GRADE 6&quot;<\/strong>/);
  assert.match(html, /<hr\/>/);
  assert.match(html, /<h4>I\. PHÂN TÍCH KẾT QUẢ BÀI LÀM<\/h4>/);
  // Bullets written right under a numbered heading nest inside it.
  assert.match(html, /<ol><li><strong>Tổng quan:<\/strong><ul><li><strong>Số lượng bài nộp:<\/strong> 01 bài <em>\(mẫu khảo sát nhỏ\)<\/em>\.<\/li>/);
  assert.match(html, /<blockquote>Ghi chú: dùng <code>Present Simple<\/code>\.<\/blockquote>/);
  assert.doesNotMatch(html, /\*\*|###|---/);
});

test('HTML in the AI answer is shown as text, never as markup', () => {
  const html = renderToStaticMarkup(<Markdown text={'<img src=x onerror=alert(1)> **ok**'} />);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('teacher feedback for students is plain text', () => {
  const feedback = plainText('## Nhận xét\n\n**Em làm tốt** phần *ngữ pháp*.\n\n- Ôn lại `since/for`\n- Làm thêm bài tập\n\n---');
  assert.equal(feedback, 'Nhận xét\n\nEm làm tốt phần ngữ pháp.\n\nÔn lại since/for\nLàm thêm bài tập');
});
